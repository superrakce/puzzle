(function(){
  const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'];
  const SHAPE_OPTIONS = [
    {value:'classic', label:'經典拼圖'},
    {value:'rectangle', label:'矩型'},
    {value:'circle', label:'圓型'},
    {value:'triangle', label:'三角型'},
    {value:'star', label:'星型'},
    {value:'diamond', label:'菱型'},
    {value:'pentagon', label:'五角型'}
  ];
  const SHAPE_LABELS = Object.fromEntries(SHAPE_OPTIONS.map(item=>[item.value, item.label]));
  const CUTOUT_SHAPES = new Set(['circle', 'triangle', 'star', 'diamond', 'pentagon']);
  const PUZZLE_APP = {};

  function stripExtension(value){
    return String(value || '').replace(/\.[^.]+$/, '');
  }

  function getFileName(value){
    return String(value || '')
      .split('?')[0]
      .split('#')[0]
      .split('/')
      .pop() || '';
  }

  function getDirectory(value){
    const cleanValue = String(value || '').split('?')[0].split('#')[0];
    const index = cleanValue.lastIndexOf('/');
    return index === -1 ? '' : cleanValue.slice(0, index + 1);
  }

  function toAbsoluteAssetUrl(baseUrl, assetPath){
    if(!assetPath){
      return '';
    }

    if(
      assetPath.startsWith('data:') ||
      assetPath.startsWith('http://') ||
      assetPath.startsWith('https://') ||
      assetPath.startsWith('/')
    ){
      return assetPath;
    }

    return getDirectory(baseUrl) + assetPath.replace(/^\.\/+/, '');
  }

  function normalizeShapeType(value){
    const normalized = String(value || '').trim().toLowerCase();
    if(SHAPE_LABELS[normalized]){
      return normalized;
    }
    return 'rectangle';
  }

  function getShapeLabel(shapeType){
    return SHAPE_LABELS[normalizeShapeType(shapeType)];
  }

  function tracePolygonPath(ctx, points){
    if(!points.length){
      return;
    }

    ctx.moveTo(points[0].x, points[0].y);
    for(let i = 1; i < points.length; i++){
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
  }

  function createRegularPolygonPoints(cx, cy, radius, sides, rotation){
    const points = [];
    for(let i = 0; i < sides; i++){
      const angle = rotation + (Math.PI * 2 * i) / sides;
      points.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius
      });
    }
    return points;
  }

  function createStarPoints(cx, cy, outerRadius, innerRadius, points, rotation){
    const out = [];
    for(let i = 0; i < points * 2; i++){
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = rotation + (Math.PI * i) / points;
      out.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius
      });
    }
    return out;
  }

  function getCutoutTransform(shapeType, row, col, width, height){
    const offsetSeedX = ((row * 7 + col * 3) % 5) - 2;
    const offsetSeedY = ((row * 5 + col * 11) % 5) - 2;
    const shiftX = offsetSeedX * width * 0.018;
    const shiftY = offsetSeedY * height * 0.018;
    const baseRotation = ((row * 13 + col * 17) % 10) * (Math.PI / 40);

    if(shapeType === 'triangle'){
      return {
        shiftX,
        shiftY,
        rotation: -Math.PI / 2 + ((row + col) % 4) * (Math.PI / 2)
      };
    }

    if(shapeType === 'diamond'){
      return {
        shiftX,
        shiftY,
        rotation: Math.PI / 4 + (((row + col) % 2) ? Math.PI / 18 : -Math.PI / 18)
      };
    }

    if(shapeType === 'pentagon'){
      return {
        shiftX,
        shiftY,
        rotation: -Math.PI / 2 + baseRotation * 0.4
      };
    }

    if(shapeType === 'star'){
      return {
        shiftX,
        shiftY,
        rotation: -Math.PI / 2 + baseRotation * 0.55
      };
    }

    return {
      shiftX,
      shiftY,
      rotation: baseRotation * 0.25
    };
  }

  function getRightEdgeSign(row, col, cols){
    if(col >= cols - 1){
      return 0;
    }
    return (row + col) % 2 === 0 ? 1 : -1;
  }

  function getBottomEdgeSign(row, col, rows){
    if(row >= rows - 1){
      return 0;
    }
    return (row * 3 + col) % 2 === 0 ? -1 : 1;
  }

  function getClassicEdges(row, col, rows, cols){
    return {
      top: row === 0 ? 0 : -getBottomEdgeSign(row - 1, col, rows),
      right: getRightEdgeSign(row, col, cols),
      bottom: getBottomEdgeSign(row, col, rows),
      left: col === 0 ? 0 : -getRightEdgeSign(row, col - 1, cols)
    };
  }

  function traceClassicHorizontalEdge(ctx, startX, y, width, edge, direction){
    const length = Math.abs(width);
    const along = Math.sign(width) || 1;
    const endX = startX + width;
    if(edge === 0){
      ctx.lineTo(endX, y);
      return;
    }

    const knobHeight = length * 0.18;
    const curveDir = edge * direction;
    ctx.lineTo(startX + along * length * 0.35, y);
    ctx.bezierCurveTo(
      startX + along * length * 0.38, y,
      startX + along * length * 0.40, y + curveDir * knobHeight * 0.15,
      startX + along * length * 0.43, y + curveDir * knobHeight * 0.35
    );
    ctx.bezierCurveTo(
      startX + along * length * 0.46, y + curveDir * knobHeight,
      startX + along * length * 0.54, y + curveDir * knobHeight,
      startX + along * length * 0.57, y + curveDir * knobHeight * 0.35
    );
    ctx.bezierCurveTo(
      startX + along * length * 0.60, y + curveDir * knobHeight * 0.15,
      startX + along * length * 0.62, y,
      startX + along * length * 0.65, y
    );
    ctx.lineTo(endX, y);
  }

  function traceClassicVerticalEdge(ctx, x, startY, height, edge, direction){
    const length = Math.abs(height);
    const along = Math.sign(height) || 1;
    const endY = startY + height;
    if(edge === 0){
      ctx.lineTo(x, endY);
      return;
    }

    const knobWidth = length * 0.18;
    const curveDir = edge * direction;
    ctx.lineTo(x, startY + along * length * 0.35);
    ctx.bezierCurveTo(
      x, startY + along * length * 0.38,
      x + curveDir * knobWidth * 0.15, startY + along * length * 0.40,
      x + curveDir * knobWidth * 0.35, startY + along * length * 0.43
    );
    ctx.bezierCurveTo(
      x + curveDir * knobWidth, startY + along * length * 0.46,
      x + curveDir * knobWidth, startY + along * length * 0.54,
      x + curveDir * knobWidth * 0.35, startY + along * length * 0.57
    );
    ctx.bezierCurveTo(
      x + curveDir * knobWidth * 0.15, startY + along * length * 0.60,
      x, startY + along * length * 0.62,
      x, startY + along * length * 0.65
    );
    ctx.lineTo(x, endY);
  }

  function traceClassicPiecePath(ctx, x, y, width, height, edges){
    ctx.beginPath();
    ctx.moveTo(x, y);
    traceClassicHorizontalEdge(ctx, x, y, width, edges.top, -1);
    traceClassicVerticalEdge(ctx, x + width, y, height, edges.right, 1);
    traceClassicHorizontalEdge(ctx, x + width, y + height, -width, edges.bottom, 1);
    traceClassicVerticalEdge(ctx, x, y + height, -height, edges.left, -1);
    ctx.closePath();
  }

  function traceCutoutShapePath(ctx, shapeType, metrics){
    const {x, y, width, height, row, col} = metrics;
    const transform = getCutoutTransform(shapeType, row, col, width, height);
    const marginX = width * 0.03;
    const marginY = height * 0.03;
    const cx = x + width / 2 + transform.shiftX;
    const cy = y + height / 2 + transform.shiftY;
    const availableX = Math.max(width * 0.32, Math.min(cx - x, x + width - cx) - marginX);
    const availableY = Math.max(height * 0.32, Math.min(cy - y, y + height - cy) - marginY);
    const minAvailable = Math.min(availableX, availableY);

    ctx.beginPath();

    if(shapeType === 'circle'){
      ctx.arc(cx, cy, minAvailable * 1.02, 0, Math.PI * 2);
      ctx.closePath();
      return;
    }

    if(shapeType === 'triangle'){
      tracePolygonPath(ctx, createRegularPolygonPoints(cx, cy, minAvailable * 1.12, 3, transform.rotation));
      return;
    }

    if(shapeType === 'diamond'){
      tracePolygonPath(ctx, createRegularPolygonPoints(cx, cy, minAvailable * 1.18, 4, transform.rotation));
      return;
    }

    if(shapeType === 'pentagon'){
      tracePolygonPath(ctx, createRegularPolygonPoints(cx, cy, minAvailable * 1.08, 5, transform.rotation));
      return;
    }

    if(shapeType === 'star'){
      tracePolygonPath(ctx, createStarPoints(cx, cy, minAvailable * 1.12, minAvailable * 0.62, 5, transform.rotation));
      return;
    }

    ctx.rect(x, y, width, height);
    ctx.closePath();
  }

  function tracePiecePath(ctx, shapeType, metrics){
    if(shapeType === 'classic'){
      traceClassicPiecePath(
        ctx,
        metrics.x,
        metrics.y,
        metrics.width,
        metrics.height,
        getClassicEdges(metrics.row, metrics.col, metrics.rows, metrics.cols)
      );
      return;
    }

    if(shapeType === 'rectangle'){
      ctx.beginPath();
      ctx.rect(metrics.x, metrics.y, metrics.width, metrics.height);
      ctx.closePath();
      return;
    }

    traceCutoutShapePath(ctx, shapeType, metrics);
  }

  function drawPieceOutline(ctx, shapeType, metrics){
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = Math.max(2, Math.min(metrics.width, metrics.height) * 0.05);
    tracePiecePath(ctx, shapeType, metrics);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(15,23,42,0.35)';
    ctx.lineWidth = Math.max(1, Math.min(metrics.width, metrics.height) * 0.018);
    tracePiecePath(ctx, shapeType, metrics);
    ctx.stroke();
    ctx.restore();
  }

  function createPieceCanvas(image, row, col, cols, rows, shapeType){
    const cellWidth = image.width / cols;
    const cellHeight = image.height / rows;
    const normalizedShape = normalizeShapeType(shapeType);
    const padX = normalizedShape === 'classic' ? cellWidth * 0.28 : 0;
    const padY = normalizedShape === 'classic' ? cellHeight * 0.28 : 0;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(cellWidth + padX * 2);
    canvas.height = Math.round(cellHeight + padY * 2);
    const ctx = canvas.getContext('2d');

    tracePiecePath(ctx, normalizedShape, {
      x: padX,
      y: padY,
      width: cellWidth,
      height: cellHeight,
      row,
      col,
      rows,
      cols
    });
    ctx.save();
    ctx.clip();
    ctx.drawImage(
      image,
      padX - col * cellWidth,
      padY - row * cellHeight,
      image.width,
      image.height
    );
    ctx.restore();

    return {
      canvas,
      widthUnits: canvas.width / cellWidth,
      heightUnits: canvas.height / cellHeight,
      offsetXUnits: -padX / cellWidth,
      offsetYUnits: -padY / cellHeight
    };
  }

  PUZZLE_APP.SHAPE_OPTIONS = SHAPE_OPTIONS;
  PUZZLE_APP.normalizeShapeType = normalizeShapeType;
  PUZZLE_APP.getShapeLabel = getShapeLabel;

  PUZZLE_APP.readFileAsDataURL = function(file){
    return new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onload = ()=>resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  PUZZLE_APP.downloadBlob = function(blob, filename){
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url), 3000);
  };

  PUZZLE_APP.downloadJSON = function(data, filename){
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    PUZZLE_APP.downloadBlob(blob, filename);
  };

  PUZZLE_APP.readJSON = async function(url){
    let res;
    try{
      res = await fetch(url, {cache:'no-store'});
    }catch(err){
      if(window.location.protocol === 'file:'){
        throw new Error('目前是用 file:// 開啟，瀏覽器會阻擋讀取本地 JSON。請改用 GitHub Pages 或本機伺服器。');
      }
      throw err;
    }

    if(!res.ok){
      throw new Error(`讀取 JSON 失敗：${url}`);
    }
    return await res.json();
  };

  PUZZLE_APP.parseGithubUrl = function(owner, repo, branch, path){
    const cleanPath = String(path || '').replace(/^\/+|\/+$/g, '');
    return `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}?ref=${branch}`;
  };

  PUZZLE_APP.fileExists = async function(url){
    try{
      const headRes = await fetch(url, {method:'HEAD', cache:'no-store'});
      if(headRes.ok){
        return true;
      }
      if(headRes.status !== 405 && headRes.status !== 403){
        return false;
      }
    }catch(err){
      // Some static hosts do not support HEAD.
    }

    try{
      const getRes = await fetch(url, {cache:'no-store'});
      return getRes.ok;
    }catch(err){
      return false;
    }
  };

  PUZZLE_APP.resolvePuzzleImageUrl = async function(jsonUrl, options = {}){
    const {fileList = null, imageFile = ''} = options;

    if(imageFile){
      const explicitUrl = toAbsoluteAssetUrl(jsonUrl, imageFile);
      if(await PUZZLE_APP.fileExists(explicitUrl)){
        return explicitUrl;
      }
    }

    const jsonBaseName = stripExtension(getFileName(jsonUrl));

    if(Array.isArray(fileList) && fileList.length){
      const matchedFile = fileList.find(file=>{
        if(file.type && file.type !== 'file'){
          return false;
        }
        const extension = getFileName(file.name).split('.').pop()?.toLowerCase() || '';
        return stripExtension(file.name) === jsonBaseName && IMAGE_EXTENSIONS.includes(extension);
      });

      if(matchedFile){
        return matchedFile.download_url || toAbsoluteAssetUrl(jsonUrl, matchedFile.name);
      }
    }

    const baseUrl = getDirectory(jsonUrl) + jsonBaseName;
    for(const extension of IMAGE_EXTENSIONS){
      const candidate = `${baseUrl}.${extension}`;
      if(await PUZZLE_APP.fileExists(candidate)){
        return candidate;
      }
    }

    throw new Error(`找不到對應圖片：${jsonBaseName}`);
  };

  PUZZLE_APP.normalizePuzzleData = async function(data, options = {}){
    const jsonUrl = options.jsonUrl || '';
    const normalized = {...data};
    const fallbackName = stripExtension(getFileName(jsonUrl)) || 'puzzle';

    normalized.id = normalized.id || fallbackName;
    normalized.name = normalized.name || fallbackName;
    normalized.cols = Math.max(2, parseInt(normalized.cols || '4', 10));
    normalized.rows = Math.max(2, parseInt(normalized.rows || '4', 10));
    normalized.thumbSize = Math.max(160, parseInt(normalized.thumbSize || '320', 10));
    normalized.shapeType = normalizeShapeType(normalized.shapeType);
    normalized.__sourceUrl = jsonUrl;

    if(normalized.imageDataUrl && normalized.imageDataUrl.startsWith('data:')){
      normalized.thumbDataUrl = normalized.thumbDataUrl || normalized.imageDataUrl;
      return normalized;
    }

    if(normalized.imageDataUrl){
      normalized.imageDataUrl = toAbsoluteAssetUrl(jsonUrl, normalized.imageDataUrl);
    }else{
      normalized.imageDataUrl = await PUZZLE_APP.resolvePuzzleImageUrl(jsonUrl, {
        fileList: options.fileList,
        imageFile: normalized.imageFile
      });
    }

    if(normalized.thumbDataUrl){
      normalized.thumbDataUrl = toAbsoluteAssetUrl(jsonUrl, normalized.thumbDataUrl);
    }else{
      normalized.thumbDataUrl = normalized.imageDataUrl;
    }

    return normalized;
  };

  PUZZLE_APP.resolveManifestItemUrl = function(item){
    if(typeof item === 'string'){
      return item;
    }

    if(item?.json){
      return item.json;
    }

    if(item?.file){
      return `data/${item.file}`;
    }

    if(item?.base){
      return `data/${item.base}.json`;
    }

    throw new Error('manifest 項目缺少 JSON 路徑');
  };

  PUZZLE_APP.loadRemoteList = async function(owner, repo, branch, path){
    const apiUrl = PUZZLE_APP.parseGithubUrl(owner, repo, branch, path);
    const res = await fetch(apiUrl, {
      headers:{'Accept':'application/vnd.github+json'}
    });

    if(!res.ok){
      throw new Error(`GitHub 載入失敗：${res.status}`);
    }

    const files = await res.json();
    const jsonFiles = Array.isArray(files)
      ? files.filter(file=>file.type === 'file' && file.name.endsWith('.json') && file.name !== 'manifest.json')
      : [];

    const items = [];
    for(const file of jsonFiles){
      const json = await PUZZLE_APP.readJSON(file.download_url);
      items.push(await PUZZLE_APP.normalizePuzzleData(json, {
        jsonUrl: file.download_url,
        fileList: files
      }));
    }

    return items;
  };

  PUZZLE_APP.loadManifestList = async function(){
    const manifest = await PUZZLE_APP.readJSON('data/manifest.json');
    const items = [];

    for(const item of manifest.items || []){
      const jsonUrl = PUZZLE_APP.resolveManifestItemUrl(item);
      const json = await PUZZLE_APP.readJSON(jsonUrl);
      items.push(await PUZZLE_APP.normalizePuzzleData(json, {jsonUrl}));
    }

    return items;
  };

  PUZZLE_APP.saveSelectedPuzzle = function(data){
    sessionStorage.setItem('selectedPuzzle', JSON.stringify(data));
  };

  PUZZLE_APP.getSelectedPuzzle = function(){
    const raw = sessionStorage.getItem('selectedPuzzle');
    return raw ? JSON.parse(raw) : null;
  };

  PUZZLE_APP.renderPuzzlePreview = function(canvas, image, cols, rows, shapeType, showOverlay){
    const normalizedShape = normalizeShapeType(shapeType);
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    if(!showOverlay){
      return;
    }

    const cellWidth = canvas.width / cols;
    const cellHeight = canvas.height / rows;

    for(let row = 0; row < rows; row++){
      for(let col = 0; col < cols; col++){
        drawPieceOutline(ctx, normalizedShape, {
          x: col * cellWidth,
          y: row * cellHeight,
          width: cellWidth,
          height: cellHeight,
          row,
          col,
          rows,
          cols
        });
      }
    }
  };

  PUZZLE_APP.sliceImageToPieces = function(image, cols, rows, shapeType = 'rectangle'){
    const pieces = [];
    const normalizedShape = normalizeShapeType(shapeType);

    for(let row = 0; row < rows; row++){
      for(let col = 0; col < cols; col++){
        const pieceImage = createPieceCanvas(image, row, col, cols, rows, normalizedShape);
        pieces.push({
          id:`${row}-${col}`,
          row,
          col,
          shapeType: normalizedShape,
          dataUrl: pieceImage.canvas.toDataURL('image/png'),
          widthUnits: pieceImage.widthUnits,
          heightUnits: pieceImage.heightUnits,
          offsetXUnits: pieceImage.offsetXUnits,
          offsetYUnits: pieceImage.offsetYUnits,
          boardXUnits: col + pieceImage.offsetXUnits,
          boardYUnits: row + pieceImage.offsetYUnits,
          isCutout: CUTOUT_SHAPES.has(normalizedShape)
        });
      }
    }

    return pieces;
  };

  PUZZLE_APP.shuffle = function(arr){
    const out = [...arr];
    for(let i = out.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  window.PUZZLE_APP = PUZZLE_APP;
})();
