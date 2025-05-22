function drawGrid(canvas, ctx) {
    const gridSizeZoomed = gridSize * cameraZoom;
    const offsetX = (cameraOffset.x % gridSizeZoomed + gridSizeZoomed) % gridSizeZoomed;
    const offsetY = (cameraOffset.y % gridSizeZoomed + gridSizeZoomed) % gridSizeZoomed;

    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;

    // Vertical lines
    for (let x = offsetX - gridSizeZoomed; x < canvas.width + gridSizeZoomed; x += gridSizeZoomed) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    // Horizontal lines
    for (let y = offsetY - gridSizeZoomed; y < canvas.height + gridSizeZoomed; y += gridSizeZoomed) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

function drawLineWidth(ctx, p1, p2, width, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width * cameraZoom;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
}

function drawLinesWidth(ctx, points, thickness, color) {
    for (let i = 1; i < points.length; i++) {
        const p1 = points[i - 1];
        const p2 = points[i];
        drawLineWidth(ctx, p1, p2, thickness, color);
    }
}

function drawBezierCurve(ctx, points, thickness, color) {
    if (points.length > 0) {
        const curveSize = 24;
        const resolution = 16;
        const drawPoints = [];

        drawPoints.push(points[0]);

        for (let i = 1; i < points.length - 1; i++) {
            const targetPoint = points[i];
            const prevPoint = points[i - 1];
            const nextPoint = points[i + 1];

            const targetDir = new Vector2(targetPoint.x - prevPoint.x, targetPoint.y - prevPoint.y).normalize();
            const dstToTarget = Math.hypot(targetPoint.x - prevPoint.x, targetPoint.y - prevPoint.y);
            const dstCurveStart = Math.max(dstToTarget - curveSize, dstToTarget / 2);

            const nextTargetDir = new Vector2(nextPoint.x - targetPoint.x, nextPoint.y - targetPoint.y).normalize();
            const nextTargetLength = Math.hypot(nextPoint.x - targetPoint.x, nextPoint.y - targetPoint.y);

            const curveStartPoint = new Vector2(
                prevPoint.x + targetDir.x * dstCurveStart,
                prevPoint.y + targetDir.y * dstCurveStart
            );
            const curveEndPoint = new Vector2(
                targetPoint.x + nextTargetDir.x * Math.min(curveSize, nextTargetLength / 2),
                targetPoint.y + nextTargetDir.y * Math.min(curveSize, nextTargetLength / 2)
            );

            for (let j = 0; j < resolution; j++) {
                const t = j / (resolution - 1);
                const a = curveStartPoint.lerp(targetPoint, t);
                const b = targetPoint.lerp(curveEndPoint, t);
                const p = a.lerp(b, t);

                const lastPoint = drawPoints[drawPoints.length - 1];
                if (Math.hypot(p.x - lastPoint.x, p.y - lastPoint.y) > 0.001) {
                    drawPoints.push(p);
                }
            }
        }

        drawPoints.push(points[points.length - 1]);
        drawLinesWidth(ctx, drawPoints, thickness, color);
    }
}