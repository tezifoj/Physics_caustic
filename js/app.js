const RAD_TO_DEG = 180 / Math.PI;

const colorNum = '#3657d6';
const colorTheory = '#e8833a';
const colorApprox = '#2e9e6a';
const colorExtra = '#c2408a';

let params = null;     // текущие параметры
let sim = null;        // результат моделирования пучка
let analysis = null;   // каустика, фокусы и тд
let frame = 0;         // номер кадра анимации
let playing = false;
let speed = 5;
let calcTime = 0;      // сколько мс занял расчёт
let layers = {};       // какие слои включены
let activeTab = 'angle';
let needRedraw = { angle: true, focus: true };
let experiments = [];  // серии экспериментов

const renderer = new SceneRenderer(document.getElementById('scene'));


function fmt(value, digits) {
    if (digits === undefined) digits = 3;
    if (!isFinite(value)) return '—';
    return value.toFixed(digits).replace('.', ',');
}

function parseList(str) {
    let parts = str.split(/[;,\s]+/);
    let result = [];
    for (let i = 0; i < parts.length; i++) {
        let x = parseFloat(parts[i].replace(',', '.'));
        if (isFinite(x)) result.push(x);
    }
    return result;
}

function pause() {
    return new Promise(function (resolve) {
        setTimeout(resolve, 0);
    });
}

function clamp(x, min, max) {
    return Math.min(Math.max(x, min), max);
}

function fmtTex(value, digits) {
    if (!isFinite(value)) return '\\text{—}';
    return fmt(value, digits).replace(',', '{,}');
}

function numTex(x) {
    return String(x).replace('.', '{,}');
}

function renderTex(el) {
    if (typeof renderMathInElement !== 'function') return;
    renderMathInElement(el, {
        delimiters: [
            { left: '\\[', right: '\\]', display: true },
            { left: '\\(', right: '\\)', display: false }
        ],
        throwOnError: false
    });
}

function methodTex(n) {
    if (Math.abs(n - 2) < 1e-9) {
        return '\\(\\theta = 2\\,\\operatorname{arctg}\\frac{K}{b\\,v_0^2}\\)';
    }
    if (Math.abs(n - 3) < 1e-9) {
        return '\\(\\theta = \\pi\\left(\\frac{1}{\\sqrt{1-\\alpha}} - 1\\right),\\ \\alpha = \\frac{K}{v_0^2 b^2}\\)';
    }
    return '\\(\\theta = 2\\int_0^{u_0} \\frac{du}{\\sqrt{1 - u^2 + \\beta u^{n-1}}} - \\pi\\)';
}


// Параметры

function readNumber(form, name, defaultValue) {
    let x = parseFloat(String(form.elements[name].value).replace(',', '.'));
    if (isFinite(x)) return x;
    return defaultValue;
}

function readParams() {
    let form = document.getElementById('params');

    let p = {};
    p.N = Math.round(clamp(readNumber(form, 'N', 60), 2, 500));
    p.v0 = clamp(readNumber(form, 'v0', 2), 0.01, 1000);
    p.n = clamp(readNumber(form, 'power', 2), 0.5, 5);
    p.K = clamp(readNumber(form, 'K', 1), -100, 100);
    p.bMin = clamp(readNumber(form, 'bMin', 0.2), 0.001, 1000);
    p.bMax = clamp(readNumber(form, 'bMax', 3), 0.001, 1000);
    p.L = clamp(readNumber(form, 'L', 10), 0.5, 1000);
    p.xMax = clamp(readNumber(form, 'xMax', 20), 0.5, 1000);
    p.rCapture = clamp(readNumber(form, 'rCapture', 0.05), 0.0001, 10);
    p.eta = clamp(readNumber(form, 'eta', 0.01), 0.0001, 0.3);
    p.symmetric = form.elements.symmetric.checked;

    if (!p.symmetric && p.bMin >= p.bMax) {
        p.bMax = p.bMin + 1;
    }
    return p;
}

function connectSliders() {
    let sliders = document.querySelectorAll('input[data-sync]');
    for (let i = 0; i < sliders.length; i++) {
        let slider = sliders[i];
        let input = document.getElementById(slider.dataset.sync);

        slider.addEventListener('input', function () {
            input.value = slider.value;
            paramsChanged();
        });
        input.addEventListener('input', function () {
            slider.value = input.value;
        });
    }
}


// Расчёт

function recalculate() {
    params = readParams();

    let start = performance.now();
    sim = Beam.simulate(params);
    analysis = Caustic.analyze(sim);
    calcTime = performance.now() - start;

    renderer.setDensity(analysis.density);
    showStats();
    showCurrentTheory();

    needRedraw.angle = true;
    needRedraw.focus = true;
    updateActiveTab();
}

let timer = null;
function paramsChanged() {
    clearTimeout(timer);
    timer = setTimeout(function () {
        let wasPlaying = playing;
        recalculate();
        if (wasPlaying) {
            frame = 0;
            setPlaying(true);
        } else {
            frame = sim.nT;
        }
        draw();
    }, 250);
}


// Анимация

function draw() {
    renderer.draw({
        sim: sim,
        analysis: analysis,
        frame: frame,
        layers: layers
    });
    showHud();
}

function animationStep() {
    if (!playing) return;

    frame = Math.min(frame + speed, sim.nT);
    draw();

    if (frame >= sim.nT) {
        setPlaying(false);
        return;
    }
    requestAnimationFrame(animationStep);
}

function setPlaying(value) {
    let wasPlaying = playing;
    playing = value;
    document.getElementById('btn-start').disabled = value;
    document.getElementById('btn-pause').disabled = !value;
    if (value && !wasPlaying) {
        requestAnimationFrame(animationStep);
    }
}

function showHud() {
    if (!sim) return;

    let k = Math.min(frame, sim.nT);
    let flying = 0;
    let captured = 0;
    for (let i = 0; i < sim.rays.length; i++) {
        let ray = sim.rays[i];
        if (k < ray.len - 1) flying++;
        else if (ray.captured) captured++;
    }

    let hud = document.getElementById('hud');
    hud.innerHTML =
        '\\(t = ' + fmtTex(k * sim.dt, 2) + '\\)   (шаг вывода \\(\\Delta t = ' + fmtTex(sim.dt, 4) + '\\))\n' +
        'в полёте: ' + flying + '   захвачено: ' + captured + '   из ' + sim.rays.length;
    renderTex(hud);
}

function fitView() {
    renderer.fit(sim.bounds);
    draw();
}


// Статистика

function statCard(label, value, sub) {
    let html = '<div class="stat">';
    html += '<div class="label">' + label + '</div>';
    html += '<div class="value">' + value + '</div>';
    if (sub) html += '<div class="sub">' + sub + '</div>';
    html += '</div>';
    return html;
}

function showStats() {
    let s = analysis.stats;

    let bList = [];
    for (let i = 0; i < sim.rays.length; i++) {
        if (!sim.rays[i].captured) bList.push(Math.abs(sim.rays[i].b));
    }
    if (bList.length === 0) bList.push(NaN);

    let xfMin = Theory.focalDistance(Math.min(...bList), params.v0, params.K, params.n);
    let xfMax = Theory.focalDistance(Math.max(...bList), params.v0, params.K, params.n);
    let hasTheory = isFinite(xfMin);

    let html = '';
    html += statCard('Частиц в пучке', sim.rays.length, '\\(\\Delta b = ' + fmtTex(sim.db, 4) + '\\)');
    html += statCard('Захвачено центром', s.captured, 'ушло из области: ' + s.escaped);
    html += statCard('Начало фокусировки \\(x_{\\min}\\)', fmt(s.focalXmin, 3),
        hasTheory ? 'теория: ' + fmt(xfMin, 3) : 'первое пересечение оси');
    html += statCard('Конец фокальной линии', fmt(s.focalXmax, 3),
        hasTheory ? 'теория: ' + fmt(xfMax, 3) : 'лучей пересекло ось: ' + s.focalCount);
    html += statCard('Точек каустики \\((\\det J = 0)\\)', s.envelopeCount,
        s.envelopeCount ? '' : 'огибающая вырождена в ось');
    html += statCard('Макс. плотность у оси', fmt(s.axisPeak.value, 2) + '×', 'при \\(x \\approx ' + fmtTex(s.axisPeak.x, 2) + '\\)');
    html += statCard('Мин. ширина пучка', fmt(s.minWidth.value * 100, 0) + ' %',
        'от исходной, при \\(x \\approx ' + fmtTex(s.minWidth.x, 2) + '\\)');
    html += statCard('Расчёт', fmt(calcTime, 0) + ' мс', 'шагов РК4: ' + sim.totalSteps.toLocaleString('ru-RU'));

    let statsEl = document.getElementById('stats');
    statsEl.innerHTML = html;
    renderTex(statsEl);
}

// "Текущий режим" на вкладке Теория
function showCurrentTheory() {
    let p = params;
    let th = Theory.angle(1, p.v0, p.K, p.n);

    let text = '\\(n = ' + fmtTex(p.n, 2) + ',\\ K = ' + fmtTex(p.K, 2) + ',\\ v_0 = ' + fmtTex(p.v0, 2) + '\\). ';
    text += 'Формула: ' + methodTex(p.n) + '. ';

    if (p.n <= 1) {
        text += 'При \\(n \\le 1\\) теоретическая формула для частицы из бесконечности неприменима — смотрите только численный расчёт.';
    } else {
        text += 'Для \\(b = 1\\) теоретический угол \\(\\theta = ' + fmtTex(Math.abs(th.theta) * RAD_TO_DEG, 3) + '^\\circ\\).';
    }

    if (Math.abs(p.n - 2) < 1e-9 && p.K > 0) {
        let coef = p.v0 * p.v0 / (2 * p.K);
        text += ' Фокальная линия: \\(x_f = \\dfrac{b^2 v_0^2}{2K} = ' + fmtTex(coef, 3) + '\\,b^2\\).';
    }

    let el = document.getElementById('theory-current');
    el.innerHTML = text;
    renderTex(el);
}

function makeTable(headers, rows, caption) {
    let html = '<table>';
    if (caption) html += '<caption>' + caption + '</caption>';

    html += '<thead><tr>';
    for (let i = 0; i < headers.length; i++) {
        html += '<th>' + headers[i] + '</th>';
    }
    html += '</tr></thead><tbody>';

    for (let i = 0; i < rows.length; i++) {
        html += '<tr>';
        for (let j = 0; j < rows[i].length; j++) {
            html += '<td>' + rows[i][j] + '</td>';
        }
        html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
}


// "Угол отклонения"

function calcAngle(b, p) {
    let th = Theory.angle(b, p.v0, p.K, p.n);
    let num = Physics.deflection(b, p.v0, p.K, p.n, {
        eta: Math.min(p.eta, 0.004),
        rCapture: Math.min(p.rCapture, 0.001)
    });

    let theor = Math.abs(th.theta) * RAD_TO_DEG;
    let numeric = num.theta * RAD_TO_DEG;

    let error = NaN;
    if (isFinite(theor) && theor > 0) {
        error = Math.abs(numeric - theor) / theor * 100;
    }

    return {
        b: b,
        theor: theor,
        numeric: numeric,
        visible: num.thetaVisible * RAD_TO_DEG,
        approx: Math.abs(Theory.smallAngle(b, p.v0, p.K, p.n)) * RAD_TO_DEG,
        error: error,
        num: num,
        method: th.method
    };
}

function drawAngleTab() {
    let p = params;
    let bFrom = parseFloat(document.getElementById('angle-bfrom').value) || 0.5;
    let bTo = parseFloat(document.getElementById('angle-bto').value) || 4;

    // 40 точек для графика
    let points = [];
    let count = 40;
    for (let i = 0; i < count; i++) {
        let b = bFrom + (bTo - bFrom) * i / (count - 1);
        points.push(calcAngle(b, p));
    }

    let theoryLine = [], numLine = [], approxLine = [];
    for (let i = 0; i < points.length; i++) {
        theoryLine.push([points[i].b, points[i].theor]);
        numLine.push([points[i].b, points[i].numeric]);
        approxLine.push([points[i].b, points[i].approx]);
    }

    Charts.line(document.getElementById('chart-angle'), {
        xLabel: 'прицельное расстояние b',
        yLabel: 'угол отклонения θ, °',
        yZero: true,
        series: [
            { name: 'теория', color: colorTheory, points: theoryLine, width: 4 },
            { name: 'РК4', color: colorNum, points: numLine, markers: true, line: false },
            { name: 'малые углы', color: colorApprox, points: approxLine, dash: [6, 4] }
        ]
    });

    // таблица для выбранных b
    let bValues = parseList(document.getElementById('angle-blist').value);
    let rows = [];
    for (let i = 0; i < bValues.length; i++) {
        let b = bValues[i];
        if (b <= 0) continue;

        let d = calcAngle(b, p);
        if (d.num.captured) {
            rows.push([fmt(b, 2), fmt(d.theor, 4), 'захват', '—', '—', fmt(d.num.rmin, 3), '—']);
        } else {
            rows.push([
                fmt(b, 2),
                fmt(d.theor, 4),
                fmt(d.numeric, 4),
                fmt(d.visible, 4),
                isFinite(d.error) ? fmt(d.error, 5) + ' %' : '—',
                fmt(d.num.rmin, 3),
                d.num.energyError.toExponential(1)
            ]);
        }
    }

    let tableEl = document.getElementById('angle-table');
    tableEl.innerHTML = makeTable(
        ['\\(b\\)', '\\(\\theta\\) теор, °', '\\(\\theta\\) числ, °', 'видимый, °', 'погрешность', '\\(r_{\\min}\\)', '\\(\\Delta E/E\\)'],
        rows,
        '\\(K = ' + fmtTex(p.K, 2) + ',\\ v_0 = ' + fmtTex(p.v0, 2) + ',\\ n = ' + fmtTex(p.n, 2) + '\\)'
    );
    renderTex(tableEl);

    let noteEl = document.getElementById('angle-note');
    noteEl.innerHTML =
        'Теория: ' + methodTex(p.n) + '. Численно частица стартует из далёкой точки с энергией и моментом, ' +
        'как у частицы «из бесконечности». «\\(\\theta\\) числ» — полный поворот скорости (может превышать 180°, если частица ' +
        'закручивается вокруг центра), «видимый» — угол между начальным и конечным направлениями.';
    renderTex(noteEl);
}


// Фокусировка и каустика

function drawFocusTab() {
    let p = params;

    let focal = [];
    for (let i = 0; i < analysis.focal.length; i++) {
        if (analysis.focal[i].order === 0) focal.push(analysis.focal[i]);
    }

    let positive = [], negative = [], bAbs = [];
    for (let i = 0; i < focal.length; i++) {
        let f = focal[i];
        if (f.b > 0) positive.push([f.b, f.x]);
        else negative.push([-f.b, f.x]);
        bAbs.push(Math.abs(f.b));
    }
    bAbs.sort(function (a, b) { return a - b; });

    let theoryXf = [];
    for (let i = 0; i < bAbs.length; i++) {
        theoryXf.push([bAbs[i], Theory.focalDistance(bAbs[i], p.v0, p.K, p.n)]);
    }

    Charts.line(document.getElementById('chart-focal'), {
        xLabel: '|b|',
        yLabel: 'x_f',
        series: [
            { name: 'теория (n = 2)', color: colorTheory, points: theoryXf, width: 4 },
            { name: 'b > 0', color: colorNum, points: positive, markers: true, line: false },
            { name: 'b < 0', color: colorExtra, points: negative, markers: true, line: false, markerSize: 2 }
        ]
    });

    let prof = analysis.profile;
    let density = [], width = [], gap = [];
    for (let i = 0; i < prof.X.length; i++) {
        density.push([prof.X[i], prof.axisDensity[i]]);
        width.push([prof.X[i], prof.width[i]]);
        gap.push([prof.X[i], prof.minGapRatio[i]]);
    }

    Charts.line(document.getElementById('chart-axis'), {
        xLabel: 'x',
        yLabel: 'относительная плотность',
        yZero: true,
        series: [{ name: '|y| < ' + fmt(prof.axisHalfWidth, 2), color: colorNum, points: density }]
    });

    Charts.line(document.getElementById('chart-gap'), {
        xLabel: 'x',
        yLabel: 'в единицах исходных величин',
        yZero: true,
        series: [
            { name: 'ширина / ширина₀ (10–90 %)', color: colorTheory, points: width },
            { name: 'мин. зазор / Δb', color: colorNum, points: gap }
        ]
    });

    // сколько лучей пересекает ось на каждом участке
    let bins = 20;
    let binWidth = p.xMax / bins;
    let counts = [];
    for (let i = 0; i < bins; i++) counts.push(0);

    for (let i = 0; i < focal.length; i++) {
        let x = focal[i].x;
        if (x > 0 && x <= p.xMax) {
            let k = Math.min(bins - 1, Math.floor(x / binWidth));
            counts[k]++;
        }
    }

    let histPoints = [];
    for (let i = 0; i < bins; i++) {
        histPoints.push([(i + 0.5) * binWidth, counts[i] / binWidth]);
    }

    let sides = p.symmetric ? 2 : 1;
    let isNewton = Math.abs(p.n - 2) < 1e-9 && p.K > 0;

    let bMaxAbs = 0;
    for (let i = 0; i < sim.bs.length; i++) bMaxAbs = Math.max(bMaxAbs, Math.abs(sim.bs[i]));
    let xEnd = Theory.focalDistance(bMaxAbs, p.v0, p.K, p.n);

    let histTheory = [];
    for (let i = 1; i <= 120; i++) {
        let x = p.xMax * i / 120;
        let value = NaN;
        if (isNewton && x <= xEnd) {
            value = sides * Math.sqrt(2 * p.K) / (2 * sim.db * p.v0 * Math.sqrt(x));
        }
        histTheory.push([x, value]);
    }

    Charts.line(document.getElementById('chart-hist'), {
        xLabel: 'x',
        yLabel: 'фокальных точек на единицу длины',
        yZero: true,
        series: [
            { name: 'РК4', color: colorExtra, points: histPoints, markers: true },
            { name: 'теория (n = 2)', color: colorTheory, points: histTheory, dash: [6, 4] }
        ]
    });

    // текст над графиками
    let s = analysis.stats;
    let note = 'Лучей пересекло ось: ' + s.focalCount + '; фокальная область от \\(x = ' + fmtTex(s.focalXmin, 3) +
        '\\) до \\(x = ' + fmtTex(s.focalXmax, 3) + '\\). ';
    if (s.envelopeCount > 0) {
        note += 'Найдено ' + s.envelopeCount + ' точек огибающей \\((\\det J = 0)\\) — они показаны оранжевым на сцене.';
    } else {
        note += 'Соседние лучи с одной стороны от центра не пересекаются \\((\\det J \\neq 0)\\): каустика вырождена в отрезок оси — фокальную линию.';
    }
    if (isNewton) {
        note += ' Отклонение от теории \\(x_f = \\dfrac{b^2 v_0^2}{2K}\\) связано со стартом с конечного расстояния \\(L\\).';
    }
    note += ' Шаг по \\(b\\): \\(\\Delta b = ' + fmtTex(sim.db, 4) + '\\).';

    let noteEl = document.getElementById('focus-note');
    noteEl.innerHTML = note;
    renderTex(noteEl);
}


// Серия экспериментов

const paramNames = { N: 'N', v0: 'v₀', n: 'n', K: 'K' };
const paramNamesTex = { N: '\\(N\\)', v0: '\\(v_0\\)', n: '\\(n\\)', K: '\\(K\\)' };

const metrics = {
    thetaNum: 'θ числ, °',
    thetaTheor: 'θ теор, °',
    err: 'погр., %',
    focalXmin: 'x_min фокуса',
    focalXmax: 'x_max фокуса',
    axisPeak: 'макс. плотн.',
    captured: 'захвачено',
    envelopeCount: 'точек каустики'
};

const metricsTex = {
    thetaNum: '\\(\\theta\\) числ, °',
    thetaTheor: '\\(\\theta\\) теор, °',
    err: 'погр., %',
    focalXmin: '\\(x_{\\min}\\) фокуса',
    focalXmax: '\\(x_{\\max}\\) фокуса',
    axisPeak: 'макс. плотн.',
    captured: 'захвачено',
    envelopeCount: 'точек каустики'
};

async function runExperiments() {
    let paramName = document.getElementById('exp-param').value;
    let values = parseList(document.getElementById('exp-values').value);
    let bRef = parseFloat(document.getElementById('exp-bref').value) || 1;
    let base = readParams();

    let button = document.getElementById('exp-run');
    let progress = document.getElementById('exp-progress');
    button.disabled = true;

    let series = { param: paramName, bRef: bRef, base: base, rows: [] };

    for (let i = 0; i < values.length; i++) {
        progress.textContent = 'расчёт ' + (i + 1) + ' из ' + values.length + '…';
        await pause();

        let p = Object.assign({}, base);
        p[paramName] = paramName === 'N' ? Math.round(values[i]) : values[i];

        let s = Beam.simulate(p);
        let a = Caustic.analyze(s);
        let angle = calcAngle(bRef, p);

        series.rows.push({
            value: p[paramName],
            thetaNum: angle.numeric,
            thetaTheor: angle.theor,
            err: angle.error,
            focalXmin: a.stats.focalXmin,
            focalXmax: a.stats.focalXmax,
            axisPeak: a.stats.axisPeak.value,
            captured: a.stats.captured,
            envelopeCount: a.stats.envelopeCount
        });
    }

    experiments.push(series);
    progress.textContent = 'готово';
    button.disabled = false;
    showExperiments();
}

function showExperiments() {
    let metric = document.getElementById('exp-metric').value;
    let palette = [colorNum, colorTheory, colorApprox, colorExtra, '#7a5cd6', '#2aa3b8'];

    let chartSeries = [];
    for (let i = 0; i < experiments.length; i++) {
        let exp = experiments[i];
        let pts = [];
        for (let j = 0; j < exp.rows.length; j++) {
            pts.push([exp.rows[j].value, exp.rows[j][metric]]);
        }
        chartSeries.push({
            name: paramNames[exp.param] + ' (серия ' + (i + 1) + ')',
            color: palette[i % palette.length],
            points: pts,
            markers: true
        });
    }

    Charts.line(document.getElementById('chart-exp'), {
        xLabel: 'значение параметра',
        yLabel: metrics[metric],
        series: chartSeries
    });

    let html = '';
    for (let i = 0; i < experiments.length; i++) {
        let exp = experiments[i];
        let headers = [paramNamesTex[exp.param]].concat(Object.values(metricsTex));

        let rows = [];
        for (let j = 0; j < exp.rows.length; j++) {
            let r = exp.rows[j];
            rows.push([
                fmt(r.value, 3), fmt(r.thetaNum, 3), fmt(r.thetaTheor, 3), fmt(r.err, 4),
                fmt(r.focalXmin, 3), fmt(r.focalXmax, 3), fmt(r.axisPeak, 2), r.captured, r.envelopeCount
            ]);
        }

        let caption = 'Серия ' + (i + 1) + ': меняется ' + paramNamesTex[exp.param] +
            '; \\(N = ' + exp.base.N + ',\\ v_0 = ' + numTex(exp.base.v0) + ',\\ n = ' + numTex(exp.base.n) +
            ',\\ K = ' + numTex(exp.base.K) + '\\), \\(b\\) для угла \\(= ' + numTex(exp.bRef) + '\\)';

        html += makeTable(headers, rows, caption);
    }

    if (html === '') html = '<p class="note">Пока нет результатов.</p>';
    let expTable = document.getElementById('exp-table');
    expTable.innerHTML = html;
    renderTex(expTable);
}

// Проверка точности

async function checkAccuracy() {
    let p = readParams();
    let b = parseFloat(document.getElementById('acc-b').value) || 1;

    let etaList = parseList(document.getElementById('acc-eta').value);
    let nList = parseList(document.getElementById('acc-n').value);

    let button = document.getElementById('acc-run');
    button.disabled = true;
    await pause();

    // как ошибка зависит от шага η
    let theor = Math.abs(Theory.angle(b, p.v0, p.K, p.n).theta) * RAD_TO_DEG;
    let rows = [];
    let angleErr = [];
    let energyErr = [];

    for (let i = 0; i < etaList.length; i++) {
        let eta = etaList[i];
        if (eta <= 0) continue;

        let r = Physics.deflection(b, p.v0, p.K, p.n, { eta: eta, rCapture: 0.001 });
        let numeric = r.theta * RAD_TO_DEG;
        let err = Math.abs(numeric - theor) / theor;

        rows.push([
            fmt(eta, 4),
            r.steps.toLocaleString('ru-RU'),
            fmt(numeric, 6),
            fmt(theor, 6),
            isFinite(err) ? err.toExponential(2) : '—',
            r.energyError ? r.energyError.toExponential(1) : '—'
        ]);
        angleErr.push([eta, err]);
        energyErr.push([eta, r.energyError]);
    }

    let accTable = document.getElementById('acc-table');
    accTable.innerHTML = makeTable(
        ['\\(\\eta\\)', 'шагов', '\\(\\theta\\) числ, °', '\\(\\theta\\) теор, °', 'отн. погрешность', '\\(\\Delta E/E\\)'],
        rows,
        'Влияние шага интегрирования \\((b = ' + numTex(b) + ')\\)'
    );
    renderTex(accTable);

    Charts.line(document.getElementById('chart-acc'), {
        xLabel: 'η (log₁₀)',
        yLabel: 'относительная ошибка (log₁₀)',
        xLog: true,
        yLog: true,
        series: [
            { name: 'ошибка угла', color: colorNum, points: angleErr, markers: true },
            { name: 'ошибка энергии', color: colorTheory, points: energyErr, markers: true, dash: [6, 4] }
        ]
    });

    let rowsN = [];
    for (let i = 0; i < nList.length; i++) {
        let N = Math.round(nList[i]);
        if (N < 2) continue;

        await pause();
        let p2 = Object.assign({}, p);
        p2.N = N;
        let s2 = Beam.simulate(p2);
        let st = Caustic.analyze(s2).stats;

        rowsN.push([N, fmt(s2.db, 4), fmt(st.focalXmin, 4), fmt(st.focalXmax, 4), fmt(st.axisPeak.value, 2), st.captured]);
    }

    let accTableN = document.getElementById('acc-table-n');
    accTableN.innerHTML = makeTable(
        ['\\(N\\)', '\\(\\Delta b\\)', '\\(x_{\\min}\\) фокуса', '\\(x_{\\max}\\) фокуса', 'макс. плотн.', 'захвачено'],
        rowsN,
        'Устойчивость при увеличении числа частиц'
    );
    renderTex(accTableN);

    button.disabled = false;
}


// Вкладки

function updateActiveTab() {
    if (activeTab === 'angle' && needRedraw.angle) {
        drawAngleTab();
        needRedraw.angle = false;
    }
    if (activeTab === 'focus' && needRedraw.focus) {
        drawFocusTab();
        needRedraw.focus = false;
    }
}

function setupTabs() {
    let buttons = document.querySelectorAll('.tab-nav button');
    let panels = document.querySelectorAll('.tab-panel');

    for (let i = 0; i < buttons.length; i++) {
        buttons[i].addEventListener('click', function () {
            let tab = this.dataset.tab;

            for (let j = 0; j < buttons.length; j++) {
                buttons[j].classList.toggle('active', buttons[j] === this);
            }
            for (let j = 0; j < panels.length; j++) {
                panels[j].classList.toggle('active', panels[j].id === 'tab-' + tab);
            }

            activeTab = tab;
            if (tab === 'experiments') showExperiments();
            updateActiveTab();
        });
    }
}


// Запуск

function init() {
    connectSliders();
    setupTabs();

    let checkboxes = document.querySelectorAll('input[data-layer]');
    for (let i = 0; i < checkboxes.length; i++) {
        let cb = checkboxes[i];
        layers[cb.dataset.layer] = cb.checked;
        cb.addEventListener('change', function () {
            layers[cb.dataset.layer] = cb.checked;
            draw();
        });
    }

    document.getElementById('params').addEventListener('change', paramsChanged);

    document.getElementById('btn-start').addEventListener('click', function () {
        if (frame >= sim.nT) frame = 0;
        setPlaying(true);
    });
    document.getElementById('btn-pause').addEventListener('click', function () {
        setPlaying(false);
    });
    document.getElementById('btn-reset').addEventListener('click', function () {
        setPlaying(false);
        recalculate();
        frame = 0;
        draw();
        setPlaying(true);
    });
    document.getElementById('speed').addEventListener('input', function () {
        speed = Number(this.value);
    });

    // масштаб
    document.getElementById('zoom-in').addEventListener('click', function () {
        renderer.zoom(1.3);
        draw();
    });
    document.getElementById('zoom-out').addEventListener('click', function () {
        renderer.zoom(1 / 1.3);
        draw();
    });
    document.getElementById('zoom-fit').addEventListener('click', fitView);
    renderer.onChange = draw;
    renderer.onFitRequest = fitView;

    // кнопки на вкладках
    document.getElementById('angle-run').addEventListener('click', function () {
        needRedraw.angle = true;
        updateActiveTab();
    });
    document.getElementById('exp-run').addEventListener('click', runExperiments);
    document.getElementById('exp-clear').addEventListener('click', function () {
        experiments = [];
        showExperiments();
    });
    document.getElementById('exp-metric').addEventListener('change', showExperiments);
    document.getElementById('acc-run').addEventListener('click', checkAccuracy);

    // при изменении размера окна всё перерисовываем
    window.addEventListener('resize', function () {
        renderer.resize();
        draw();
        needRedraw.angle = true;
        needRedraw.focus = true;
        updateActiveTab();
        if (activeTab === 'experiments') showExperiments();
    });

    recalculate();
    renderer.resize();
    renderer.fit(sim.bounds);
    frame = 0;
    draw();
    setPlaying(true);
}

init();