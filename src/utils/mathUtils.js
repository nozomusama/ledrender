export function solveHomography(src, dst) {
    let i, j, k;
    let a = [];
    for (i = 0; i < 4; i++) {
        let x = src[i].x, y = src[i].y;
        let X = dst[i].x, Y = dst[i].y;
        a.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
        a.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
    }
    let b = [dst[0].x, dst[0].y, dst[1].x, dst[1].y, dst[2].x, dst[2].y, dst[3].x, dst[3].y];
    let n = 8;
    for (i = 0; i < n; i++) {
        let maxEl = Math.abs(a[i][i]), maxRow = i;
        for (k = i + 1; k < n; k++) {
            if (Math.abs(a[k][i]) > maxEl) { maxEl = Math.abs(a[k][i]); maxRow = k; }
        }
        for (k = i; k < n; k++) { let tmp = a[maxRow][k]; a[maxRow][k] = a[i][k]; a[i][k] = tmp; }
        let tmp = b[maxRow]; b[maxRow] = b[i]; b[i] = tmp;
        for (k = i + 1; k < n; k++) {
            let c = -a[k][i] / a[i][i];
            for (j = i; j < n; j++) { if (i === j) { a[k][j] = 0; } else { a[k][j] += c * a[i][j]; } }
            b[k] += c * b[i];
        }
    }
    let x = new Array(n).fill(0);
    for (i = n - 1; i > -1; i--) {
        let sum = 0;
        for (j = i + 1; j < n; j++) { sum += a[i][j] * x[j]; }
        x[i] = (b[i] - sum) / a[i][i];
    }
    return [x[0], x[3], 0, x[6], x[1], x[4], 0, x[7], 0, 0, 1, 0, x[2], x[5], 0, 1];
}

export const calculateResults = (w_m, h_m, cabId, pitch, cabinets) => {
    const cab = cabinets.find(c => c.id === cabId) || cabinets[0];
    const cols = Math.max(1, Math.round((w_m * 1000) / cab.w));
    const rows = Math.max(1, Math.round((h_m * 1000) / cab.h));

    const actualW = (cols * cab.w) / 1000;
    const actualH = (rows * cab.h) / 1000;
    const totalArea = actualW * actualH;

    const resW = Math.round((actualW * 1000) / pitch);
    const resH = Math.round((actualH * 1000) / pitch);
    const totalPixels = resW * resH;

    const totalCabinets = cols * rows;

    // Güç ve Ağırlık
    const totalWeight = totalCabinets * cab.kg;
    const totalMaxPowerKW = (totalCabinets * cab.maxW) / 1000;
    const totalAvgPowerKW = (totalCabinets * cab.avgW) / 1000;

    return {
        cols, rows, actualW, actualH, resW, resH, cab,
        totalArea, totalWeight, totalMaxPowerKW, totalAvgPowerKW, totalCabinets
    };
};
