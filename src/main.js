import * as THREE from 'three';

const Blockly = window.Blockly;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const blockDefinitions = [
  {
    type: 'path_start',
    message0: 'START %1 %2',
    args0: [
      { type: 'input_dummy' },
      { type: 'input_statement', name: 'STACK' }
    ],
    colour: '#f0bd35',
    tooltip: 'ここにつないだブロックから順番に実行します。',
    helpUrl: ''
  },
  {
    type: 'robot_move_forward',
    message0: 'すすむ',
    previousStatement: null,
    nextStatement: null,
    colour: '#4C97FF',
    tooltip: 'ロボットを向いている方向へ1マス進めます。',
    helpUrl: ''
  },
  {
    type: 'robot_turn_right',
    message0: 'みぎへ',
    previousStatement: null,
    nextStatement: null,
    colour: '#4C97FF',
    tooltip: 'ロボットの向きを右へ90度変えます。',
    helpUrl: ''
  },
  {
    type: 'robot_turn_left',
    message0: 'ひだりへ',
    previousStatement: null,
    nextStatement: null,
    colour: '#4C97FF',
    tooltip: 'ロボットの向きを左へ90度変えます。',
    helpUrl: ''
  },
  {
    type: 'repeat_times',
    message0: 'くりかえし %1 回 %2 %3',
    args0: [
      {
        type: 'field_dropdown',
        name: 'TIMES',
        options: [
          ['1', '1'],
          ['2', '2'],
          ['3', '3'],
          ['4', '4'],
          ['5', '5']
        ]
      },
      { type: 'input_dummy' },
      { type: 'input_statement', name: 'DO' }
    ],
    previousStatement: null,
    nextStatement: null,
    colour: '#FF8C1A',
    tooltip: '中に入れた命令を指定した回数くりかえします。',
    helpUrl: ''
  }
];

window.PATHCODE_BLOCK_DEFINITIONS = blockDefinitions;

function registerBlocklyGenerators(javascriptGenerator) {
  javascriptGenerator.forBlock.path_start = (block, generator) => generator.statementToCode(block, 'STACK');
  javascriptGenerator.forBlock.robot_move_forward = () => 'await pathcode.moveForward();\n';
  javascriptGenerator.forBlock.robot_turn_right = () => 'await pathcode.turnRobot("right");\n';
  javascriptGenerator.forBlock.robot_turn_left = () => 'await pathcode.turnRobot("left");\n';
  javascriptGenerator.forBlock.repeat_times = (block, generator) => {
    const times = Math.max(1, Math.min(5, Number(block.getFieldValue('TIMES')) || 1));
    const branch = generator.statementToCode(block, 'DO');
    return `for (let i = 0; i < ${times}; i += 1) {\n${branch}}\n`;
  };
}

window.registerBlocklyGenerators = registerBlocklyGenerators;

const levels = [
  {
    title: 'はじめの一歩',
    objective: 'すすむを3回だけ使ってエネルギーを回収',
    width: 4,
    depth: 1,
    start: [0, 0],
    dir: 0,
    energy: [[3, 0]],
    walls: [],
    blockLimits: { robot_move_forward: 3 },
    expectedProgram: [
      { type: 'robot_move_forward' },
      { type: 'robot_move_forward' },
      { type: 'robot_move_forward' }
    ]
  },
  {
    title: 'くりかえし',
    objective: '指定回数のブロックだけでエネルギーを回収',
    width: 4,
    depth: 5,
    start: [2, 0],
    dir: 0,
    energy: [[2, 4]],
    tiles: [[2, 0], [3, 0], [3, 1], [3, 2], [2, 2], [1, 2], [1, 3], [1, 4], [2, 4]],
    walls: [],
    blockLimits: { repeat_times: 2, robot_move_forward: 4, robot_turn_right: 1, robot_turn_left: 1 },
    expectedProgram: [
      {
        type: 'repeat_times',
        times: '2',
        children: [
          { type: 'robot_move_forward' },
          { type: 'robot_turn_right' },
          { type: 'robot_move_forward' }
        ]
      },
      {
        type: 'repeat_times',
        times: '2',
        children: [
          { type: 'robot_move_forward' },
          { type: 'robot_turn_left' },
          { type: 'robot_move_forward' }
        ]
      }
    ]
  }
];

let blocklyWorkspace;
let startBlock;
let lastToolboxXml = '';
let levelIndex = 0;
let running = false;
let collected = new Set();
let stepIndex = 0;
let canvas;
let renderer;
let scene3d;
let camera3d;
let stageGroup;
let robotGroup;
let cameraMode = 'first-person';
let robotBodyMaterial;
let robotHeadMaterial;
let energyMeshes = [];
let robotState = { x: 0, y: 0, z: 0, dir: 0, rx: 0, ry: 0, rz: 0 };
let robotColor = '#f3c64b';
let headColor = '#fafbf6';
const defaultCameraYaw = Math.PI / 5;
const defaultCameraPitch = 0.62;
const minCameraPitch = -1.38;
const maxCameraPitch = 1.38;
let cameraYaw = defaultCameraYaw;
let cameraPitch = defaultCameraPitch;
let animationFrame = 0;
let lastFrameTime = 0;

const $ = id => document.getElementById(id);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function numberField(block, name) {
  const value = Number(block.getFieldValue(name));
  return Number.isFinite(value) ? value : 0;
}

function byteField(block, name) {
  return Math.round(Math.max(0, Math.min(255, numberField(block, name))));
}

function createIcons() {
  const paths = {
    'volume-2': '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15 9.5a4 4 0 0 1 0 5"></path><path d="M17.5 7a7 7 0 0 1 0 10"></path>',
    'volume-x': '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M22 9l-6 6"></path><path d="M16 9l6 6"></path>',
    'circle-help': '<circle cx="12" cy="12" r="10"></circle><path d="M9.1 9a3 3 0 1 1 5.8 1c-.5 1-1.6 1.5-2.2 2.2-.4.4-.7.8-.7 1.8"></path><path d="M12 17h.01"></path>',
    play: '<polygon points="6 3 20 12 6 21 6 3"></polygon>',
    square: '<rect x="5" y="5" width="14" height="14" rx="2"></rect>',
    'rotate-ccw': '<path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 3v6h6"></path>',
    'rotate-cw': '<path d="M21 12a9 9 0 1 1-3-6.7"></path><path d="M21 3v6h-6"></path>',
    'zoom-in': '<circle cx="11" cy="11" r="8"></circle><path d="M21 21l-4.3-4.3"></path><path d="M11 8v6"></path><path d="M8 11h6"></path>',
    'zoom-out': '<circle cx="11" cy="11" r="8"></circle><path d="M21 21l-4.3-4.3"></path><path d="M8 11h6"></path>',
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"></path><path d="M17 3h2a2 2 0 0 1 2 2v2"></path><path d="M21 17v2a2 2 0 0 1-2 2h-2"></path><path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>',
    x: '<path d="M18 6L6 18"></path><path d="M6 6l12 12"></path>'
  };

  document.querySelectorAll('i[data-lucide]').forEach(node => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = paths[node.getAttribute('data-lucide')] || '';
    node.replaceWith(svg);
  });
}

function initTabs() {
  $('levelTabs').innerHTML = levels.map((_, i) => `<button class="level-tab ${i === 0 ? 'active' : ''}" data-level="${i}">LEVEL ${String(i + 1).padStart(2, '0')}</button>`).join('');
  $('levelTabs').addEventListener('click', e => {
    const button = e.target.closest('[data-level]');
    if (button && !running) loadLevel(Number(button.dataset.level));
  });
}

function initProgram() {
  if (!Blockly) {
    $('blocklyDiv').innerHTML = '<div class="blockly-load-error">Blocklyを読み込めませんでした</div>';
    return;
  }

  Blockly.defineBlocksWithJsonArray(blockDefinitions);
  registerBlocklyGenerators(getJavascriptGenerator());
  blocklyWorkspace = Blockly.inject('blocklyDiv', {
    toolbox: $('blocklyToolbox'),
    renderer: 'zelos',
    theme: Blockly.Themes?.Zelos || Blockly.Themes?.Classic,
    trashcan: false,
    scrollbars: true,
    grid: { spacing: 20, length: 3, colour: '#d7d7d7', snap: true },
    zoom: { controls: true, wheel: true, startScale: 0.82, maxScale: 1.25, minScale: 0.6, scaleSpeed: 1.08 }
  });

  createStartProgram();
  Blockly.svgResize(blocklyWorkspace);
  updateToolboxForLevel();
  blocklyWorkspace.addChangeListener(() => {
    updateGeneratedCode();
    updateToolboxForLevel();
  });
  window.addEventListener('resize', () => {
    Blockly.svgResize(blocklyWorkspace);
    resizeCanvas();
  });

  $('clearBtn').onclick = () => {
    if (!running) {
      resetBlocklyWorkspace();
      resetRun();
    }
  };
  $('runBtn').onclick = runProgram;
  $('resetBtn').onclick = resetRun;
  updateGeneratedCode();
}

function getJavascriptGenerator() {
  const generator = Blockly.JavaScript || window.javascript?.javascriptGenerator;
  if (!generator) throw new Error('Blockly JavaScript generator is not available.');
  return generator;
}

function createStartProgram() {
  startBlock = blocklyWorkspace.newBlock('path_start');
  startBlock.initSvg();
  startBlock.render();
  startBlock.moveBy(28, 28);
  startBlock.setDeletable(false);
  startBlock.setMovable(false);
}

function resetBlocklyWorkspace() {
  if (!blocklyWorkspace) return;
  blocklyWorkspace.clear();
  lastToolboxXml = '';
  createStartProgram();
  updateGeneratedCode();
  updateToolboxForLevel();
}

function updateToolboxForLevel() {
  if (!Blockly || !blocklyWorkspace) return;
  const toolboxText = toolboxXmlForLevel(levelIndex);
  if (toolboxText === lastToolboxXml) return;
  const textToDom = Blockly.utils?.xml?.textToDom || Blockly.Xml.textToDom;
  const toolbox = textToDom(toolboxText);
  blocklyWorkspace.updateToolbox(toolbox);
  lastToolboxXml = toolboxText;
}

function toolboxXmlForLevel(index) {
  const level = levels[index];
  const counts = workspaceBlockCounts();
  const disabled = type => counts[type] >= (level.blockLimits?.[type] || 0) ? ' disabled="true"' : '';
  const remaining = type => Math.max(0, (level.blockLimits?.[type] || 0) - (counts[type] || 0));
  const repeatBlock = index >= 1 ? `<block type="repeat_times"${disabled('repeat_times')}></block>` : '';
  const turnBlocks = index >= 1
    ? `
      <block type="robot_turn_right"${disabled('robot_turn_right')}></block>
      <block type="robot_turn_left"${disabled('robot_turn_left')}></block>
    `
    : '';
  const labels = index >= 1
    ? `
      <label text="残り: くりかえし ${remaining('repeat_times')}回"></label>
      <label text="すすむ ${remaining('robot_move_forward')}回 / みぎへ ${remaining('robot_turn_right')}回 / ひだりへ ${remaining('robot_turn_left')}回"></label>
    `
    : `<label text="残り: すすむ ${remaining('robot_move_forward')}回"></label>`;
  return `
    <xml>
      ${labels}
      <block type="robot_move_forward"${disabled('robot_move_forward')}></block>
      ${turnBlocks}
      ${repeatBlock}
    </xml>
  `;
}

function initStage() {
  canvas = $('scene');
  canvas.style.display = 'block';
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0xdde3dd, 1);
  scene3d = new THREE.Scene();
  camera3d = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  stageGroup = new THREE.Group();
  scene3d.add(stageGroup);
  scene3d.add(new THREE.HemisphereLight(0xffffff, 0x9aa39d, 2.3));

  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(3.8, 5.5, 4.2);
  scene3d.add(sun);

  buildStageMeshes();
  setupStageDrag();
  document.querySelectorAll('[data-camera-mode]').forEach(button => {
    button.addEventListener('click', () => {
      cameraMode = button.dataset.cameraMode;
      document.querySelectorAll('[data-camera-mode]').forEach(option => {
        option.setAttribute('aria-pressed', String(option === button));
      });
      drawScene(lastFrameTime);
    });
  });
  resizeCanvas();
  expose3DApi();
  requestAnimationFrame(drawLoop);
}

function setupStageDrag() {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener('pointerdown', event => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture?.(event.pointerId);
  });

  canvas.addEventListener('pointermove', event => {
    if (!dragging) return;
    if (running && cameraMode === 'first-person') {
      lastX = event.clientX;
      lastY = event.clientY;
      return;
    }
    const freeCamera = !running || cameraMode === 'free';
    if (freeCamera) cameraYaw += (event.clientX - lastX) * 0.012;
    cameraPitch = clamp(cameraPitch + (event.clientY - lastY) * 0.008,
      freeCamera ? minCameraPitch : 0.35, maxCameraPitch);
    lastX = event.clientX;
    lastY = event.clientY;
  });

  const stopDragging = event => {
    dragging = false;
    if (event?.pointerId !== undefined) canvas.releasePointerCapture?.(event.pointerId);
  };

  canvas.addEventListener('pointerup', stopDragging);
  canvas.addEventListener('pointercancel', stopDragging);
  canvas.addEventListener('pointerleave', stopDragging);
}

function resizeCanvas() {
  if (!canvas || !renderer || !camera3d) return;
  const box = $('sceneWrap').getBoundingClientRect();
  renderer.setSize(Math.max(1, box.width), Math.max(1, box.height), false);
  camera3d.aspect = Math.max(1, box.width) / Math.max(1, box.height);
  camera3d.updateProjectionMatrix();
}

function loadLevel(index) {
  levelIndex = index;
  const level = levels[index];
  document.querySelectorAll('.level-tab').forEach((button, i) => button.classList.toggle('active', i === index));
  $('levelTitle').textContent = level.title;
  $('objectiveText').textContent = level.objective;
  updateToolboxForLevel();
  resetBlocklyWorkspace();
  buildStageMeshes();
  resetRun();
}

function resetRun() {
  const level = levels[levelIndex];
  robotState = { x: level.start[0], y: 0, z: level.start[1], dir: level.dir, rx: 0, ry: directionAngle(level.dir), rz: 0 };
  robotColor = '#f3c64b';
  headColor = '#fafbf6';
  updateRobotMaterialColors();
  collected.clear();
  stepIndex = 0;
  blocklyWorkspace?.highlightBlock(null);
  setStatus('READY', 'ready');
  running = false;
  updateRunButton();
  updateStats();
}

function expose3DApi() {
  const robotApi = {
    get position() { return { x: robotState.x, y: robotState.y, z: robotState.z }; },
    get rotation() { return { x: robotState.rx, y: robotState.ry, z: robotState.rz }; },
    get color() { return robotColor; },
    get object3D() { return robotGroup; }
  };
  const api = {
    get scene() { return scene3d; },
    get renderer() { return renderer; },
    get cube() { return robotApi; },
    get robot() { return robotApi; },
    moveObject,
    rotateObject,
    setObjectColor,
    moveForward,
    turnRobot,
    reset: resetRun
  };
  window.scene = scene3d;
  window.cube = robotApi;
  window.robot = robotApi;
  window.pathcode = api;
}

function directionAngle(dir) {
  return [0, -90, 180, 90][dir];
}

function directionVector(dir) {
  return [[1, 0], [0, 1], [-1, 0], [0, -1]][dir];
}

function updateGeneratedCode() {
  if (!blocklyWorkspace) return '';
  const code = getJavascriptGenerator().workspaceToCode(blocklyWorkspace);
  if ($('generatedCode')) $('generatedCode').textContent = code.trim();
  return code;
}

function currentProgramShape() {
  const firstBlock = startBlock?.getInputTargetBlock('STACK');
  return blockStackShape(firstBlock);
}

function blockStackShape(block) {
  const blocks = [];
  let current = block;
  while (current) {
    blocks.push(blockShape(current));
    current = current.getNextBlock();
  }
  return blocks;
}

function blockShape(block) {
  if (block.type === 'repeat_times') {
    return {
      type: block.type,
      times: block.getFieldValue('TIMES'),
      children: blockStackShape(block.getInputTargetBlock('DO'))
    };
  }
  return { type: block.type };
}

function programShapeMatches(actual, expected) {
  if (actual.length !== expected.length) return false;
  return actual.every((actualBlock, index) => {
    const expectedBlock = expected[index];
    if (actualBlock.type !== expectedBlock.type) return false;
    if (actualBlock.times !== expectedBlock.times) return false;
    return programShapeMatches(actualBlock.children || [], expectedBlock.children || []);
  });
}

function countBlocks(shape, counts = {}) {
  shape.forEach(block => {
    counts[block.type] = (counts[block.type] || 0) + 1;
    countBlocks(block.children || [], counts);
  });
  return counts;
}

function workspaceBlockCounts() {
  if (!blocklyWorkspace) return {};
  return blocklyWorkspace.getAllBlocks(false).reduce((counts, block) => {
    if (block.type !== 'path_start') counts[block.type] = (counts[block.type] || 0) + 1;
    return counts;
  }, {});
}

function blockCountsWithinLimits(counts, limits = {}) {
  return Object.entries(counts).every(([type, count]) => count <= (limits[type] || 0));
}

function hasOnlyStartTopBlock() {
  return blocklyWorkspace.getTopBlocks(false).every(block => block === startBlock);
}

function validateProgramForLevel() {
  const level = levels[levelIndex];
  const shape = currentProgramShape();
  const counts = workspaceBlockCounts();
  const valid =
    hasOnlyStartTopBlock() &&
    blockCountsWithinLimits(counts, level.blockLimits) &&
    programShapeMatches(shape, level.expectedProgram);

  return { valid, counts, shape };
}

async function runProgram() {
  if (running) return;
  const canComplete = validateProgramForLevel().valid;

  resetRun();
  running = true;
  updateRunButton();
  setStatus('RUNNING', 'running');

  try {
    const code = updateGeneratedCode();
    const guardedCode = [
      '"use strict";',
      'const window = undefined;',
      'const document = undefined;',
      'const localStorage = undefined;',
      'const sessionStorage = undefined;',
      'const fetch = undefined;',
      code
    ].join('\n');
    const runGeneratedCode = new AsyncFunction('pathcode', 'scene', 'cube', 'robot', guardedCode);
    await runGeneratedCode(window.pathcode, canvas, window.cube, window.robot);
    await finishRun(canComplete);
  } catch (error) {
    console.error(error);
    if ($('sceneStatus').textContent !== 'RESET') {
      setStatus('ERROR', 'fail');
      await returnToStart();
    }
  } finally {
    running = false;
    updateRunButton();
    updateStats();
  }
}

async function moveObject(x = 0, y = 0, z = 0) {
  stepIndex += 1;
  const start = { ...robotState };
  const target = {
    ...robotState,
    x: robotState.x + Number(x || 0),
    y: robotState.y + Number(y || 0),
    z: robotState.z + Number(z || 0)
  };
  await tween(430, t => {
    const q = ease(t);
    robotState.x = lerp(start.x, target.x, q);
    robotState.y = lerp(start.y, target.y, q);
    robotState.z = lerp(start.z, target.z, q);
  });
  robotState.x = target.x;
  robotState.y = target.y;
  robotState.z = target.z;
  collectAt(Math.round(robotState.x), Math.round(robotState.z));
  updateStats();
}

async function rotateObject(axis = 'y', degrees = 90) {
  stepIndex += 1;
  const key = axis === 'x' ? 'rx' : axis === 'z' ? 'rz' : 'ry';
  const start = robotState[key];
  const target = start + Number(degrees || 0);
  await tween(300, t => {
    robotState[key] = lerp(start, target, ease(t));
  });
  updateStats();
}

function setObjectColor(r = 255, g = 255, b = 255) {
  robotColor = `rgb(${clampByte(r)}, ${clampByte(g)}, ${clampByte(b)})`;
  headColor = robotColor;
  updateRobotMaterialColors();
}

function updateRobotMaterialColors() {
  robotBodyMaterial?.color.set(robotColor);
  robotHeadMaterial?.color.set(headColor);
}

async function moveForward() {
  const [dx, dz] = directionVector(robotState.dir);
  const nx = robotState.x + dx;
  const nz = robotState.z + dz;
  const level = levels[levelIndex];
  const blocked = !hasTile(nx, nz) || level.walls.some(([x, z]) => x === nx && z === nz);

  if (blocked) {
    stepIndex += 1;
    await bump(dx, dz);
    setStatus('RESET', 'fail');
    await returnToStart();
    throw new Error('The robot hit an invalid tile.');
  }

  await moveObject(dx, 0, dz);
}

async function turnRobot(direction = 'right') {
  const right = direction === 'right';
  robotState.dir = (robotState.dir + (right ? 1 : 3)) % 4;
  await rotateObject('y', right ? -90 : 90);
}

async function bump(dx, dz) {
  const start = { ...robotState };
  await tween(240, t => {
    const amount = Math.sin(Math.PI * t) * 0.18;
    robotState.x = start.x + dx * amount;
    robotState.z = start.z + dz * amount;
  });
}

async function returnToStart() {
  await wait(160);
  const start = { ...robotState };
  const level = levels[levelIndex];
  const target = { x: level.start[0], y: 0, z: level.start[1], dir: level.dir, rx: 0, ry: directionAngle(level.dir), rz: 0 };

  await tween(460, t => {
    const q = ease(t);
    robotState.x = lerp(start.x, target.x, q);
    robotState.y = lerp(start.y, target.y, q) + Math.sin(Math.PI * t) * 0.12;
    robotState.z = lerp(start.z, target.z, q);
    robotState.rx = lerp(start.rx, target.rx, q);
    robotState.ry = lerp(start.ry, target.ry, q);
    robotState.rz = lerp(start.rz, target.rz, q);
  });

  robotState = target;
  collected.clear();
  updateStats();
}

function collectAt(x, z) {
  const key = `${x},${z}`;
  if (levels[levelIndex].energy.some(([ex, ez]) => ex === x && ez === z)) collected.add(key);
}

function isGoal() {
  return collected.size === levels[levelIndex].energy.length;
}

async function finishRun(canComplete = true) {
  if (canComplete && isGoal()) {
    setStatus('MISSION COMPLETE', 'success');
    return;
  }

  if ($('sceneStatus').textContent !== 'RESET') {
    setStatus('TRY AGAIN', 'fail');
    await returnToStart();
  }
}

function setStatus(text, type = '') {
  const hints = {
    READY: '実行できます',
    RUNNING: 'キャラが移動中',
    RESET: 'スタートへ戻ります',
    'TRY AGAIN': 'ゴールできませんでした',
    ERROR: '命令を確認してください',
    'MISSION COMPLETE': 'ゴールしました'
  };
  const status = $('sceneStatus');
  status.textContent = text;
  status.dataset.hint = hints[text] || '';
  status.className = `scene-status ${type}`;
}

function updateStats() {
  $('stepCount').textContent = `${stepIndex}`;
  $('energyCount').textContent = `${collected.size} / ${levels[levelIndex].energy.length}`;
}

function updateRunButton() {
  $('runBtn').classList.toggle('running', running);
  $('runBtn').innerHTML = running ? '<i data-lucide="square"></i>実行中' : '<i data-lucide="play"></i>実行する';
  createIcons();
}

function drawLoop(time) {
  lastFrameTime = time;
  drawScene(time);
  animationFrame = requestAnimationFrame(drawLoop);
}

function drawScene(time) {
  if (!renderer || !scene3d || !camera3d) return;
  updateStage3D(time);
  renderer.render(scene3d, camera3d);
}

function project(x, z, y = 0) {
  const { x: worldX, z: worldZ } = gridToWorld(x, z);
  return new THREE.Vector3(worldX, y, worldZ);
}

function gridToWorld(x, z) {
  const level = levels[levelIndex];
  return {
    x: x - (level.width - 1) / 2,
    z: z - (level.depth - 1) / 2
  };
}

function levelTiles(level = levels[levelIndex]) {
  if (level.tiles) return level.tiles;
  const tiles = [];
  for (let z = 0; z < level.depth; z++) {
    for (let x = 0; x < level.width; x++) tiles.push([x, z]);
  }
  return tiles;
}

function hasTile(x, z) {
  return levelTiles().some(([tx, tz]) => tx === x && tz === z);
}

function buildStageMeshes() {
  if (!stageGroup) return;
  stageGroup.clear();
  energyMeshes = [];

  const level = levels[levelIndex];
  levelTiles(level).forEach(([x, z]) => stageGroup.add(createTileMesh(x, z)));
  level.energy.forEach(([x, z], index) => {
    const energy = createEnergyMesh(x, z, index);
    energyMeshes.push(energy);
    stageGroup.add(energy);
  });

  robotGroup = createRobotMesh();
  stageGroup.add(robotGroup);
  applyRobotToMesh();
}

function createTileMesh(x, z) {
  const { x: worldX, z: worldZ } = gridToWorld(x, z);
  const top = new THREE.MeshStandardMaterial({ color: (x + z) % 2 ? 0xf8f8f1 : 0xeef2e9, roughness: 0.78 });
  const sideA = new THREE.MeshStandardMaterial({ color: 0xb7c2b9, roughness: 0.85 });
  const sideB = new THREE.MeshStandardMaterial({ color: 0xa7b2aa, roughness: 0.85 });
  const bottom = new THREE.MeshStandardMaterial({ color: 0x9ca79f, roughness: 0.9 });
  const tile = new THREE.Group();
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.18, 0.94), [sideB, sideA, top, bottom, sideA, sideB]);
  block.position.set(worldX, -0.09, worldZ);
  tile.add(block);

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(block.geometry),
    new THREE.LineBasicMaterial({ color: 0x93a098, transparent: true, opacity: 0.52 })
  );
  outline.position.copy(block.position);
  tile.add(outline);
  return tile;
}

function createEnergyMesh(x, z, index) {
  const { x: worldX, z: worldZ } = gridToWorld(x, z);
  const energy = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.24, 0),
    new THREE.MeshStandardMaterial({ color: 0x18c1d0, emissive: 0x0a8d95, emissiveIntensity: 0.65, roughness: 0.28, metalness: 0.08 })
  );
  energy.position.set(worldX, 0.72, worldZ);
  energy.userData = { baseY: 0.72, index, key: `${x},${z}` };
  return energy;
}

function createRobotMesh() {
  const robot = new THREE.Group();
  robotBodyMaterial = new THREE.MeshStandardMaterial({ color: robotColor, roughness: 0.55 });
  robotHeadMaterial = new THREE.MeshStandardMaterial({ color: headColor, roughness: 0.42 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.36), robotBodyMaterial);
  body.position.y = 0.34;
  robot.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.36, 0.44), robotHeadMaterial);
  head.position.y = 0.73;
  robot.add(head);

  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.25, 0.17),
    new THREE.MeshBasicMaterial({ color: 0x29484b, side: THREE.FrontSide })
  );
  face.position.set(0.246, 0.73, 0);
  face.rotation.y = Math.PI / 2;
  robot.add(face);

  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x8ff3ed, side: THREE.FrontSide });
  [-0.055, 0.055].forEach(z => {
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.025, 16), eyeMaterial);
    eye.position.set(0.251, 0.745, z);
    eye.rotation.y = Math.PI / 2;
    robot.add(eye);
  });

  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.24, 12),
    new THREE.MeshStandardMaterial({ color: 0x46504a, roughness: 0.45 })
  );
  antenna.position.y = 1.03;
  robot.add(antenna);

  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xec705e, emissive: 0x5c130d, emissiveIntensity: 0.2, roughness: 0.35 })
  );
  tip.position.y = 1.17;
  robot.add(tip);
  return robot;
}

function updateStage3D(time) {
  updateCamera3D();
  applyRobotToMesh();
  robotGroup.visible = !(running && cameraMode === 'first-person');
  energyMeshes.forEach(mesh => {
    mesh.visible = !collected.has(mesh.userData.key);
    mesh.position.y = mesh.userData.baseY + Math.sin(time * 0.003 + mesh.userData.index) * 0.08;
    mesh.rotation.y += 0.018;
  });
}

function updateCamera3D() {
  const mode = running ? cameraMode : 'free';
  const firstPerson = mode === 'first-person';
  const fov = firstPerson ? 72 : 42;
  if (camera3d.fov !== fov) {
    camera3d.fov = fov;
    camera3d.updateProjectionMatrix();
  }
  // North is world -Z. Position the heading camera behind the robot's forward vector.
  const heading = headingVector();
  if (firstPerson) {
    const position = gridToWorld(robotState.x, robotState.z);
    const eyeHeight = robotState.y + 0.745;
    camera3d.position.set(position.x, eyeHeight, position.z);
    camera3d.lookAt(position.x + heading.x, eyeHeight - 0.22, position.z + heading.z);
    return;
  }
  const yaw = mode === 'north' ? Math.PI / 2
    : mode === 'heading' ? Math.atan2(-heading.z, -heading.x) : cameraYaw;
  const pitch = mode === 'north' || mode === 'heading' ? clamp(cameraPitch, 0.35, maxCameraPitch) : cameraPitch;
  const level = levels[levelIndex];
  const target = mode === 'heading' ? gridToWorld(robotState.x, robotState.z) : { x: 0, z: 0 };
  const radius = Math.max(5.6, Math.hypot(level.width, level.depth) * 0.65 /
    Math.min(1, camera3d.aspect)) * (mode === 'heading' ? 1.35 : 1);
  camera3d.position.set(
    target.x + Math.cos(pitch) * Math.cos(yaw) * radius,
    Math.sin(pitch) * radius + 0.45,
    target.z + Math.cos(pitch) * Math.sin(yaw) * radius
  );
  camera3d.lookAt(target.x, 0.15, target.z);
}

function applyRobotToMesh() {
  if (!robotGroup) return;
  const { x: worldX, z: worldZ } = gridToWorld(robotState.x, robotState.z);
  robotGroup.position.set(worldX, robotState.y, worldZ);
  robotGroup.rotation.set(
    THREE.MathUtils.degToRad(robotState.rx),
    THREE.MathUtils.degToRad(robotState.ry),
    THREE.MathUtils.degToRad(robotState.rz)
  );
}

function headingVector() {
  const radians = -robotState.ry * Math.PI / 180;
  return { x: Math.cos(radians), z: Math.sin(radians) };
}

function parseColor(color) {
  if (color.startsWith('#')) {
    const value = Number.parseInt(color.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }
  const match = color.match(/\d+/g)?.map(Number) || [243, 198, 75];
  return [match[0], match[1], match[2]];
}

function lighten(color, amount) {
  const [r, g, b] = parseColor(color);
  return `rgb(${Math.min(255, r + amount)}, ${Math.min(255, g + amount)}, ${Math.min(255, b + amount)})`;
}

function darken(color, amount) {
  const [r, g, b] = parseColor(color);
  return `rgb(${Math.max(0, r - amount)}, ${Math.max(0, g - amount)}, ${Math.max(0, b - amount)})`;
}

function tween(duration, update) {
  return new Promise(resolve => {
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      update(t);
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });
}

function ease(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clampByte(value) {
  return Math.round(Math.max(0, Math.min(255, Number(value) || 0)));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function initUI() {
  let sound = true;
  $('soundBtn').onclick = () => {
    sound = !sound;
    $('soundBtn').innerHTML = `<i data-lucide="${sound ? 'volume-2' : 'volume-x'}"></i>`;
    createIcons();
  };
}

createIcons();
initTabs();
initProgram();
initStage();
initUI();
loadLevel(0);
