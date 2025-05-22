let chips = [];
let currentChip = null;
let viewStack =  [];
let nav = document.getElementById("nav");
let listeners = [];
let socket = null;

// Dialogs
const editGlobalChipDialog = document.getElementById('editGlobalChipDialog');
const globalChipListContainer = document.getElementById('globalChipListContainer');
const cancelSelectGlobalChip = document.getElementById('cancelSelectGlobalChip');
const selectGlobalChipButton = document.getElementById('selectGlobalChipButton');
const closeEditGlobalChipDialog = document.getElementById('closeEditGlobalChipDialog');

const saveDiscardChipDialog = document.getElementById('saveDiscardChipDialog');
const saveDiscardTitle = document.getElementById('saveDiscardTitle');
const saveDiscardMessage = document.getElementById('saveDiscardMessage');
const saveChipButton = document.getElementById('saveChipButton');
const discardChipButton = document.getElementById('discardChipButton');
const cancelSaveDiscardButton = document.getElementById('cancelSaveDiscardButton');
const closeSaveDiscardDialog = document.getElementById('closeSaveDiscardDialog');

let pendingChipSwitchAction = null; // To store the action (function) to execute after save/discard

// Colors
const BLACK = 'rgb(0, 0, 0)';
const WHITE = 'rgb(255, 255, 255)';
const GRAY = 'rgb(82, 82, 82, 1.0)';
const RED = 'rgb(255, 0, 0, 1.0)';
const BLUE = 'rgb(0, 0, 255)';
const GRID_COLOR = 'rgba(200, 200, 200, 0.05)';
const THICKNESS = 6;
const HOVERED_THICKNESS = 8;


// Grid parameters
const gridSize = 20;
let snapToGrid = false;
let busLineCount = 1;

// List to store lines
let lines = [];
let currentLineIndex = -1;
let drawing = false;
let drawingBus = false;
let shiftKeyPressed = false;

let searchSelectedIndex = -1;
let searchResults = [];

// Mouse position
let mousePos = { x: 0, y: 0 };

// Camera and zoom
let cameraOffset = { x: 0, y: 0 };
let cameraZoom = 1;
let isDragging = false;
let lastMousePos = { x: 0, y: 0 };

let hoveredElement = null;
let selectedConnection = null;
let selectedNode = null;

let lastClickedElement = null;
let isDraggingSelection = false;
let draggingNode = null;
let dragOffset = { x: 0, y: 0 };
let selectionStart = null;
let selectedNodes = [];

const NODE_CATEGORIES = {
    'Core': ['LLMNode', 'WebSocketNode', 'InputNode', 'OutputNode'],
    'Logic': ['AndNode', 'OrNode', 'NotNode'],
    'Math': [],
    'Flow': []
};

function createChipNode(chipDefinition) {
    if (!chipDefinition || chipDefinition.id === currentChip.id) {
        console.warn("Cannot add a chip to itself or invalid chip definition.");
        return;
    }

    const clonedChip = chipDefinition.clone()
    const node = new ChipNode(null, currentChip, clonedChip);
    node.parentChip = currentChip.id;
    
    // Position node based on where the context menu/search was actioned
    node.position = new Vector2(mousePos.x, mousePos.y);
    currentChip.addNode(node);
    if (currentChip) currentChip.markDirty();
    selectedNodes = [node];
    hideContextMenu(contextMenuIdle); // Assuming called from search, which handles its own hiding
    drawScene();
}

function initializeSearch() {
    const searchInput = document.getElementById('nodeSearchInput');
    const searchResultsDiv = document.getElementById('searchResults');
    
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        searchSelectedIndex = -1;
        updateSearchResults(searchTerm);
    });
    
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            
            const maxIndex = searchResults.length - 1;
            if (maxIndex < 0) return;
            
            // Update selected index
            if (e.key === 'ArrowDown') {
                searchSelectedIndex = searchSelectedIndex < maxIndex ? searchSelectedIndex + 1 : 0;
            } else {
                searchSelectedIndex = searchSelectedIndex > 0 ? searchSelectedIndex - 1 : maxIndex;
            }
            
            // Update UI
            updateSelection();
            
            // Ensure selected item is visible
            const selectedElement = document.querySelector('.search-result.selected');
            if (selectedElement) {
                selectedElement.scrollIntoView({
                    block: 'nearest',
                    behavior: 'smooth'
                });
            }
        } else if (e.key === 'Enter' && searchSelectedIndex >= 0) {
            e.preventDefault();
            const selectedResult = searchResults[searchSelectedIndex];
            if (selectedResult.type === 'chip') {
                createChipNode(selectedResult.data);
            } else {
                createNode(selectedResult.data);
            }
        }
    });
    
    // Initial population of results
    updateSearchResults('');
}

function updateSearchResults(searchTerm) {
    const searchResultsDiv = document.getElementById('searchResults');
    searchResultsDiv.innerHTML = '';
    searchResults = [];
    
    // Search through categories and nodes
    for (const [category, nodes] of Object.entries(NODE_CATEGORIES)) {
        const filteredNodes = nodes.filter(node => 
            node.toLowerCase().includes(searchTerm)
        );
        
        if (filteredNodes.length > 0) {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'category';
            
            const categoryTitle = document.createElement('div');
            categoryTitle.className = 'category-title';
            categoryTitle.textContent = category;
            categoryDiv.appendChild(categoryTitle);
            
            filteredNodes.forEach(node => {
                const resultDiv = document.createElement('div');
                resultDiv.className = 'search-result';
                resultDiv.textContent = node;
                resultDiv.addEventListener('click', () => createNode(node));
                categoryDiv.appendChild(resultDiv);
                
                // Add to searchResults array
                searchResults.push({
                    element: resultDiv,
                    type: 'node',
                    data: node
                });
            });
            
            searchResultsDiv.appendChild(categoryDiv);
        }
    }
    
    // Search through available chips
    const availableChips = chips
        .filter(chip => chip.name.toLowerCase().includes(searchTerm));
    
    if (availableChips.length > 0) {
        const chipsCategory = document.createElement('div');
        chipsCategory.className = 'category';
        
        const categoryTitle = document.createElement('div');
        categoryTitle.className = 'category-title';
        categoryTitle.textContent = 'Chips';
        chipsCategory.appendChild(categoryTitle);
        
        availableChips.forEach(chip => {
            if(chip.name !== "main"){
                const resultDiv = document.createElement('div');
                resultDiv.className = 'search-result chip-result';
                resultDiv.textContent = chip.name;
                resultDiv.addEventListener('click', () => createChipNode(chip));
                chipsCategory.appendChild(resultDiv);
                
                // Add to searchResults array
                searchResults.push({
                    element: resultDiv,
                    type: 'chip',
                    data: chip
                });
            }
        });
        
        searchResultsDiv.appendChild(chipsCategory);
    }
}

function updateSelection() {
    // Remove selected class from all results
    document.querySelectorAll('.search-result').forEach(el => {
        el.classList.remove('selected');
    });
    
    // Add selected class to current selection
    if (searchSelectedIndex >= 0 && searchSelectedIndex < searchResults.length) {
        searchResults[searchSelectedIndex].element.classList.add('selected');
    }
}

function createNode(nodeType) {
    // This function will be called when a node is selected from the search results
    let node;
    
    switch(nodeType) {
        case 'LLMNode':
            node = new LLMNode(currentChip);
            break;
        case 'WebSocketNode':
            node = new WebSocketNode(currentChip);
            node.socket = socket;
            addListener(node);
            break;
        case 'InputNode':
            node = new ChipIONode(currentChip, "input");
            break;
        case 'OutputNode':
            node = new ChipIONode(currentChip, "output");
            break;
        case 'AndNode':
            node = new AndNode(currentChip);
            break;
        case 'OrNode':
            node = new OrNode(currentChip);
            break;
        case 'NotNode':
            node = new NotNode(currentChip);
            break;
        // Add cases for other node types
        default:
            console.warn(`Node type ${nodeType} not implemented`);
            return;
    }
    
    const rect = canvas.getBoundingClientRect();
    const worldPos = screenToWorld(contextMenuIdle.offsetLeft - rect.left, contextMenuIdle.offsetTop - rect.top);

    node.position = mousePos;
    currentChip.addNode(node);
    if (currentChip) currentChip.markDirty();
    selectedNodes = [];
    selectedNodes.push(node);

    console.log(currentChip)

    if(currentChip.id !== "main" && (nodeType === "InputNode" || nodeType === "OutputNode")){
        chips.forEach((_chip) => {
            _chip.nodes.forEach((_node) => {
                if(_node instanceof ChipNode) {
                    if(_node.chipData.id === currentChip.id) {
                        console.log("*****YES*******")
                        _node.addAntiPort(node)
                    }
                }
            })
        })
    }

    hideContextMenu(contextMenuIdle);
    drawScene();
}

function init() {
    console.log("init");
    const mainChip = new Chip("main", "main");
    chips.push(mainChip);

    if(!currentChip) {
        currentChip = mainChip;
    }
}

function addChip(chip) {
    chips.push(chip);
}

function switchToGlobalChip(chipId) {
    const action = () => {
        const chip = chips.find(c => c.id === chipId);
        if (chip) {
            if (currentChip && currentChip.id !== chip.id) { // Don't push if switching to the same chip
                viewStack.push(currentChip);
            }
            currentChip = chip;
            updateViewPath();
            reset();
            drawScene();
        } else {
            // This case for "Temp" chip seems specific and might need review if it's still needed.
            // For now, let's assume it's a valid scenario.
            const tempChip = new Chip(null, "Temp");
            if (currentChip) {
                viewStack.push(currentChip);
            }
            currentChip = tempChip;
            updateViewPath();
            reset();
            drawScene();
        }
    };

    if (currentChip && currentChip.isDirty) {
        pendingChipSwitchAction = action;
        saveDiscardTitle.textContent = `Unsaved Changes in "${currentChip.name}"`;
        saveDiscardMessage.textContent = `Chip "${currentChip.name}" has unsaved changes. Save before switching?`;
        saveDiscardChipDialog.showModal();
    } else {
        action();
    }
}

function switchToChip(chipToSwitchTo) {
    const action = () => {
        if (chipToSwitchTo) {
            if (currentChip && currentChip.id !== chipToSwitchTo.id) { // Don't push if switching to the same chip
                viewStack.push(currentChip);
            }
            currentChip = chipToSwitchTo;
            updateViewPath();
            reset();
            drawScene();
        }
    };

    if (currentChip && currentChip.isDirty && chipToSwitchTo && currentChip.id !== chipToSwitchTo.id) {
        pendingChipSwitchAction = action;
        saveDiscardTitle.textContent = `Unsaved Changes in "${currentChip.name}"`;
        saveDiscardMessage.textContent = `Chip "${currentChip.name}" has unsaved changes. Save before opening "${chipToSwitchTo.name}"?`;
        saveDiscardChipDialog.showModal();
    } else {
        action();
    }
}


function reset() {
    selectedNodes = [];
    selectedNode = null;
    selectedConnection = null;
    drawing = false;
    draggingNode = null;
    isDraggingSelection = false;
    lines = [];
    selectionStart = null;
}

function popView() {

    const chipId = currentChip.id;
    const chip = chips.find(c => c.id === chipId);


    if(chip){
        console.log("exists");
    }else {
        console.log("not exists");
    }

    if (viewStack.length > 0) {
        const targetChip = viewStack.pop(); // Temporarily pop to check
        
        const action = () => {
            currentChip = targetChip; // Actual switch
            updateViewPath();
            reset();
            drawScene();
        };

        if (currentChip && currentChip.isDirty) {
            viewStack.push(targetChip); // Push back because we haven't switched yet
            pendingChipSwitchAction = action;
            saveDiscardTitle.textContent = `Unsaved Changes in "${currentChip.name}"`;
            saveDiscardMessage.textContent = `Chip "${currentChip.name}" has unsaved changes. Save before going back?`;
            saveDiscardChipDialog.showModal();
        } else {
            action(); // Proceed with switch
        }
    }
}

function serialize() {
    return {
        chips: chips.map(chip => chip.serialize()),
        viewStack: viewStack.map(chip => chip.id),
        currentChip: currentChip ? currentChip.id : null
    };
}

function deserialize(data) {
    chips = data.chips.map(chipData => Chip.deserialize(chipData));
    viewStack = data.viewStack.map(chipId => chips.find(c => c.id === chipId));
    currentChip = chips.find(c => c.id === data.currentChip);
}

function getViewPath() {
    const stackNames = viewStack.map(chip => chip.name);
    const currentName = currentChip ? currentChip.name : '';
    return [...stackNames, currentName].join(' > ');
}



function popUntil(targetIndex) {
    const action = () => {
        while (viewStack.length > targetIndex) {
            currentChip = viewStack.pop();
        }
        updateViewPath();
        reset();
        drawScene();
    };

    if (currentChip && currentChip.isDirty && viewStack.length > targetIndex) {
        // Check if the target is different from the current one
        if (!viewStack[targetIndex] || viewStack[targetIndex].id !== currentChip.id) {
            pendingChipSwitchAction = action;
            saveDiscardTitle.textContent = `Unsaved Changes in "${currentChip.name}"`;
            saveDiscardMessage.textContent = `Chip "${currentChip.name}" has unsaved changes. Save before navigating?`;
            saveDiscardChipDialog.showModal();
        } else {
             action(); // Navigating to the same chip essentially, or no actual switch needed
        }
    } else {
        action();
    }
}

function updateViewPath() {
    if(!nav) return;

    nav.innerHTML = "";

    const test = getViewPath();
    const path = test.split(" > ");

    path.forEach((p,index) => {
        const pa = document.createElement("div");
        pa.className = "path";
        pa.textContent = p;
        pa.addEventListener("click", () => popUntil(index));
        nav.appendChild(pa);
        if(index < path.length - 1)
            nav.appendChild(document.createTextNode(">"));
    });

}

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let contextMenuConnection = document.getElementById('contextMenuConnection');
let deleteConnectionBtn = document.getElementById('deleteConnectionBtn');
fitToContainer(canvas);

deleteConnectionBtn.addEventListener('click', e => {
    e.preventDefault();
    if(!selectedConnection) return;

    deleteConnection(selectedConnection);
});

let contextMenuNode = document.getElementById('contextMenuNode');
let deleteNodeBtn = document.getElementById('deleteNodeBtn');
deleteNodeBtn.addEventListener('click', e => {
    e.preventDefault();
    
    selectedNodes.forEach(selectedNode => {
        deleteNode(selectedNode);
    });

    selectedNodes = [];
    selectedNode = null;
    draggingNode = null;
    hoveredElement = null;
    hideContextMenu(contextMenuNode);
    clearInfoBar();
    drawScene();
});

let contextMenuIdle = document.getElementById('contextMenuIdle');


function showContextMenu(menu, x, y) {
    menu.style.display = 'flex';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
}

function hideContextMenu(menu) {
    menu.style.display = 'none';
}

function fitToContainer(canvas){
  canvas.style.width ='100%';
  canvas.style.height='100%';

  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
}

init();
updateViewPath();

function detectElementUnderMouse(mousePos) {

    if(!currentChip) return;

    const nodes = currentChip.nodes;
    const connections = currentChip.connections;

    for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];

        for (let port of [...node.ports.inputs, ...node.ports.outputs]) {
            if (port.isUnderMouse(mousePos, node.position)) {
                return { type: 'port', port, node };
            }
        }

        if (node.isUnderMouse(mousePos)) {
            return { type: 'node', node };
        }
    }


    for (let connection of connections) {
        if (connection.isUnderMouse(mousePos)) {
            return { type: 'connection', connection };
        }
    }

    return null;
}

function deleteConnection(conn) {
    if (!conn) return;

    const connectionsToActuallyRemove = new Set(); // Use a Set to avoid duplicates
    connectionsToActuallyRemove.add(conn); // Start with the connection itself

    if (conn.isBusConnection) {
        console.log("Bus connection removal initiated for:", conn.id);
        const busOutputPortId = conn.port1.id; // This is the bus line's "output" end
        const busInputPortId = conn.port2.id;  // This is the bus line's "input" end

        currentChip.connections.forEach(otherConn => {
            if (otherConn === conn) return; // Already added

            // Check if otherConn is a regular wire taking output from this bus line's output port.
            // Such a connection would have its port1 as the bus's output port.
            if (!otherConn.isBusConnection && otherConn.port1 && otherConn.port1.id === busOutputPortId) {
                connectionsToActuallyRemove.add(otherConn);
                console.log("  Adding tapped wire (from bus output port " + busOutputPortId + ") for removal:", otherConn.id);
            }

            // Check if otherConn is a regular wire feeding input to this bus line's input port.
            // Such a connection would have its port2 as the bus's input port.
            if (!otherConn.isBusConnection && otherConn.port2 && otherConn.port2.id === busInputPortId) {
                connectionsToActuallyRemove.add(otherConn);
                console.log("  Adding feeding wire (to bus input port " + busInputPortId + ") for removal:", otherConn.id);
            }
        });
    }

    // Remove all identified connections
    connectionsToActuallyRemove.forEach(c => {
        const index = currentChip.connections.indexOf(c);
        if (index > -1) {
            // Call onConnectionRemoved for the actual ports of the connection being removed
            if (c.port1) c.port1.onConnectionRemoved();
            if (c.port2) c.port2.onConnectionRemoved();
            currentChip.connections.splice(index, 1);
            console.log("    Removed connection:", c.id);
        }
    });
    
    if (selectedConnection === conn) { // Clear selection if the deleted item was selected
        selectedConnection = null;
    }
    if (hoveredElement && hoveredElement.type === 'connection' && hoveredElement.connection === conn) { // Clear hover if item was hovered
         hoveredElement = null;
    }
   
    if (currentChip) currentChip.markDirty();
    hideContextMenu(contextMenuConnection);
    clearInfoBar();
    drawScene();
}

function deleteNode(node) {

    let index = listeners.indexOf(node);
    if (index > -1) {
        listeners.splice(index, 1);
    }

    index = currentChip.nodes.indexOf(node);
    if (index > -1) {
        currentChip.nodes.splice(index, 1);
    }

    const toDelete = currentChip.connections.filter(connection => {
        return connection.port1.node === node || connection.port2.node === node;
    });

    toDelete.forEach(p => {
        p.port1.onConnectionRemoved();
        p.port2.onConnectionRemoved();
    });

    currentChip.connections = currentChip.connections.filter(connection => {
        return connection.port1.node !== node && connection.port2.node !== node;
    });

    if (currentChip) currentChip.markDirty();
}
//564129
function toggleConnection(port) {

}

function portForward(port) {

    if(!port) return;
    
    //port.receiveInput();
}

function snapToGridPoint(point) {
    return {
        x: Math.round(point.x / gridSize) * gridSize,
        y: Math.round(point.y / gridSize) * gridSize
    };
}

function drawLineWidth(p1, p2, width, color) {
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

function drawLinesWidth(points, thickness, color) {
    for (let i = 1; i < points.length; i++) {
        const p1 = points[i - 1];
        const p2 = points[i];
        drawLineWidth(p1, p2, thickness, color);
    }
}

function drawParallelLines(points, lineCount, spacing, color, width) {
    if (points.length < 2) return;

    function getOffsetPoint(p1, p2, offset) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return p1;
        
        // Get perpendicular vector
        const perpX = -dy / len;
        const perpY = dx / len;
        
        return new Vector2(
            p1.x + perpX * offset,
            p1.y + perpY * offset
        );
    }

    function lineIntersection(p1, p2, p3, p4) {
        const dx1 = p2.x - p1.x;
        const dy1 = p2.y - p1.y;
        const dx2 = p4.x - p3.x;
        const dy2 = p4.y - p3.y;
        
        const denominator = (dx1 * dy2 - dy1 * dx2);
        if (Math.abs(denominator) < 0.0001) {
            return p2;
        }
        
        const t = ((p3.x - p1.x) * dy2 - (p3.y - p1.y) * dx2) / denominator;
        return new Vector2(
            p1.x + t * dx1,
            p1.y + t * dy1
        );
    }

    for (let l = 0; l < lineCount; l++) {
        const offset = (l - (lineCount - 1) / 2) * spacing;
        const offsetPoints = [];
        
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            
            const offsetP1 = getOffsetPoint(p1, p2, offset);
            const offsetP2 = getOffsetPoint(p2, p1, -offset);
            
            if (i === 0) {
                offsetPoints.push(offsetP1);
            }
            
            if (i < points.length - 2) {
                const nextP1 = points[i + 1];
                const nextP2 = points[i + 2];
                const nextOffsetP1 = getOffsetPoint(nextP1, nextP2, offset);
                const nextOffsetP2 = getOffsetPoint(nextP2, nextP1, -offset);
                
                const intersection = lineIntersection(
                    offsetP1, offsetP2,
                    nextOffsetP1, nextOffsetP2
                );
                
                const maxOffset = offset * 2;
                const dx = intersection.x - p2.x;
                const dy = intersection.y - p2.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist > Math.abs(maxOffset)) {
                    const scale = Math.abs(maxOffset) / dist;
                    intersection.x = p2.x + dx * scale;
                    intersection.y = p2.y + dy * scale;
                }
                
                offsetPoints.push(intersection);
            } else {
                offsetPoints.push(offsetP2);
            }
        }
        
        for (let i = 0; i < offsetPoints.length - 1; i++) {
            drawLineWidth(offsetPoints[i], offsetPoints[i + 1], width, color);
        }
    }
}

function getParallelLines(points) {
    if (points.length < 2) return;

    const lineCount = busLineCount;
    const spacing = 18;

    function getOffsetPoint(p1, p2, offset) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return p1;
        
        const perpX = -dy / len;
        const perpY = dx / len;
        
        return new Vector2(
            p1.x + perpX * offset,
            p1.y + perpY * offset
        );
    }

    function lineIntersection(p1, p2, p3, p4) {
        const dx1 = p2.x - p1.x;
        const dy1 = p2.y - p1.y;
        const dx2 = p4.x - p3.x;
        const dy2 = p4.y - p3.y;
        
        const denominator = (dx1 * dy2 - dy1 * dx2);
        if (Math.abs(denominator) < 0.0001) {
            return p2;
        }
        
        const t = ((p3.x - p1.x) * dy2 - (p3.y - p1.y) * dx2) / denominator;
        return new Vector2(
            p1.x + t * dx1,
            p1.y + t * dy1
        );
    }

    let result = [];

    for (let l = 0; l < lineCount; l++) {
        const offset = (l - (lineCount - 1) / 2) * spacing;
        const offsetPoints = [];
        
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            
            const offsetP1 = getOffsetPoint(p1, p2, offset);
            const offsetP2 = getOffsetPoint(p2, p1, -offset);
            
            if (i === 0) {
                offsetPoints.push(offsetP1);
            }
            
            if (i < points.length - 2) {
                const nextP1 = points[i + 1];
                const nextP2 = points[i + 2];
                const nextOffsetP1 = getOffsetPoint(nextP1, nextP2, offset);
                const nextOffsetP2 = getOffsetPoint(nextP2, nextP1, -offset);
                
                const intersection = lineIntersection(
                    offsetP1, offsetP2,
                    nextOffsetP1, nextOffsetP2
                );
                
                const maxOffset = offset * 2;
                const dx = intersection.x - p2.x;
                const dy = intersection.y - p2.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist > Math.abs(maxOffset)) {
                    const scale = Math.abs(maxOffset) / dist;
                    intersection.x = p2.x + dx * scale;
                    intersection.y = p2.y + dy * scale;
                }
                
                offsetPoints.push(intersection);
            } else {
                offsetPoints.push(offsetP2);
            }
        }
        
        result.push(offsetPoints);
    }

    return result;
}

function clearInfoBar() {
    const infobar = document.getElementById("infobar");
    infobar.innerHTML = "";
}

function drawGrid() {
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

function drawScene() {
    ctx.fillStyle = "rgb(48, 48, 48)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let hoveredConnection = null;
    let hoveredPort = null;

    drawGrid();

    ctx.save();
    ctx.translate(cameraOffset.x, cameraOffset.y);
    ctx.scale(cameraZoom, cameraZoom);



    if(lines.length > 0) {
        //drawBezierCurve(lines, BLACK, THICKNESS);
        drawParallelLines(lines, busLineCount, 18, BLACK, THICKNESS);
    }else{
        if(hoveredElement === null) {
            if(shiftKeyPressed) {
                for(let i = 0; i < busLineCount; i++) {
                    let offset = (i - (busLineCount - 1) / 2) * 18;
                    ctx.save();
                    ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
                    ctx.fillStyle = 'rgba(255, 255, 0, 0.1)';
                    ctx.fillRect(mousePos.x - 9, mousePos.y -  offset - 9 , 18, 18);
                    ctx.strokeRect(mousePos.x - 9, mousePos.y - offset - 9, 18, 18);
                    ctx.restore();
                }
            }
        }
    }

    
    currentChip.connections.forEach(conn => {
        const isHovered = hoveredElement && hoveredElement.type === 'connection' && hoveredElement.connection === conn;

        if(isHovered) {
            drawBezierCurve(conn.points, conn.on ? RED : conn.isBusConnection ? BLACK : GRAY, HOVERED_THICKNESS);

            if(conn.hoveredPoint) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(conn.hoveredPoint.x, conn.hoveredPoint.y, 10, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
                ctx.fill();
                ctx.restore();
            }
        }
        else {
            drawBezierCurve(conn.points, conn.on ? RED : conn.isBusConnection ? BLACK : GRAY, THICKNESS);
        }

        if(conn.isBusConnection) {
            conn.port1.draw(ctx, false);
            conn.port2.draw(ctx, false);
        }
        else {
            if(conn.port1.isBusPort) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(conn.points[0].x, conn.points[0].y, 7, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(0, 0, 0, 1)';
                ctx.fill();
                ctx.restore();
            }

            if(conn.port2.isBusPort) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(conn.points[conn.points.length - 1].x, conn.points[conn.points.length - 1].y, 7, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(0, 0, 0, 1)';
                ctx.fill();
                ctx.restore();
            }
        }
    });

    for (let node of currentChip.nodes) {
        node.draw(ctx);

        for (let port of [...node.ports.inputs, ...node.ports.outputs]) {
            const isHovered = hoveredElement && hoveredElement.type === 'port' && hoveredElement.port === port;

            if(isHovered) {
                hoveredPort = hoveredElement.port;
            }

            port.draw(ctx, isHovered);
        }
    }

    if(selectionStart) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 0, 255, 0.5)';
        ctx.fillStyle = 'rgba(255, 0, 255, 0.1)';
        ctx.fillRect(selectionStart.x, selectionStart.y, mousePos.x - selectionStart.x, mousePos.y - selectionStart.y);
        ctx.strokeRect(selectionStart.x, selectionStart.y, mousePos.x - selectionStart.x, mousePos.y - selectionStart.y);
        ctx.restore();
    }

    selectedNodes.forEach(node => {
        const padding = 30;
        ctx.save();
        ctx.fillStyle = 'rgba(200, 200, 200, 0.11)';

         if (node instanceof ChipIONode) {
            const radiusWithPadding = node.radius + padding / 2;
            ctx.beginPath();
            ctx.arc(node.position.x, node.position.y, radiusWithPadding, 0, 2 * Math.PI);
            ctx.fill();
        } else {
            ctx.fillRect(node.position.x - padding / 2, node.position.y - padding / 2, node.width + padding, node.height + padding);
        }
        ctx.restore();
    });

    
    if(hoveredPort) {
        hoveredPort.displayName(ctx);
    }

    ctx.restore();
}

function drawBezierCurve(points, color, thickness) {


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
        drawLinesWidth(drawPoints, thickness, color);

    }
}

function screenToWorld(screenX, screenY) {
    return {
        x: (screenX - cameraOffset.x) / cameraZoom,
        y: (screenY - cameraOffset.y) / cameraZoom
    };
}

function moveNodeToEnd(node) {
    const index = currentChip.nodes.indexOf(node);
    if (index > -1) {
        currentChip.nodes.splice(index, 1);
        currentChip.nodes.push(node);
    }
}

function handleMouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPos = screenToWorld(screenX, screenY);
    mousePos = snapToGrid ? snapToGridPoint(worldPos) : worldPos;

    if (e.target !== contextMenuConnection && !contextMenuConnection.contains(e.target)) {
        hideContextMenu(contextMenuConnection);
    }

    if (e.target !== contextMenuNode && !contextMenuNode.contains(e.target)) {
        hideContextMenu(contextMenuNode);
    } 

    if (e.target !== contextMenuIdle && !contextMenuIdle.contains(e.target)) {
        hideContextMenu(contextMenuIdle);
    }

     if (e.button === 1) { // Middle mouse button
        isDragging = true;
        hideContextMenu(contextMenuConnection);
        hideContextMenu(contextMenuNode);
        hideContextMenu(contextMenuIdle);
        lastMousePos = { x: screenX, y: screenY };
    } else if (e.button === 0) { // Left mouse button
        if (!isDragging) {

            if(drawing) {
                // lines[currentLineIndex].controlPoints.push(new Vector2(mousePos.x, mousePos.y));
                if(hoveredElement && lastClickedElement && lastClickedElement.type === "port" && hoveredElement.type === "port") {
                    if(lastClickedElement.port.type !== hoveredElement.port.type ) {
                        lines[lines.length - 1] = new Vector2(hoveredElement.port.position.x, hoveredElement.port.position.y);
                        let conn = null;

                        if(lastClickedElement.port.type === "input"){
                            conn = new Connection(null, currentChip, hoveredElement.port, lastClickedElement.port, lines.reverse())
                        }
                        else {
                            conn = new Connection(null, currentChip, lastClickedElement.port, hoveredElement.port, lines);
                        }


                        conn.port1.onConnectionAdded();
                        conn.port2.onConnectionAdded();
                        conn.port2.receiveInput(conn.port1.state);

                        if(conn.port1.state === PinState.HIGH) {
                            conn.on = true;
                        }
                        
                        currentChip.addConnection(conn);

                        lines = [];
                        drawing = false;
                        lastClickedElement = null;
                        return;
                    }
                }
                else if(hoveredElement && lastClickedElement && lastClickedElement.type === "connection" && hoveredElement.type === "port") {
                    
                    if(!lastClickedElement.connection.isBusConnection) {
                        if(lastClickedElement.connection.port1.type !== hoveredElement.port.type ) {
                            lines[lines.length - 1] = new Vector2(hoveredElement.port.position.x, hoveredElement.port.position.y);
                            let conn = new Connection(null, currentChip, lastClickedElement.connection.port1, hoveredElement.port, lines);

                            conn.port1.onConnectionAdded();
                            conn.port2.onConnectionAdded();
                            conn.port2.receiveInput(conn.port1.state);

                            if(conn.port1.state === PinState.HIGH) {
                                conn.on = true;
                            }

                            currentChip.addConnection(conn);
                            
                            lines = [];
                            drawing = false;
                            lastClickedElement = null;
                            return;
                        }
                    }
                    else {
                        console.log("bus to port");
                        lines[lines.length - 1] = new Vector2(hoveredElement.port.position.x, hoveredElement.port.position.y);
                        let conn = null;

                        console.log(lastClickedElement.connection)

                        if(hoveredElement.port.type === "input") {
                            conn = new Connection(null, currentChip, lastClickedElement.connection.port1, hoveredElement.port, lines);
                        }
                        else {
                            conn = new Connection(null, currentChip, hoveredElement.port, lastClickedElement.connection.port2, lines.reverse());
                        }

                        conn.port1.onConnectionAdded();
                        conn.port2.onConnectionAdded();
                        conn.port2.receiveInput(conn.port1.state);

                        if(conn.port1.state === PinState.HIGH) {
                            conn.on = true;
                        }

                        currentChip.addConnection(conn);
                        
                        lines = [];
                        drawing = false;
                        lastClickedElement = null;
                        return;
                    }
                }
                else if(hoveredElement && lastClickedElement && lastClickedElement.type === "port" && hoveredElement.type === "connection") {
                    
                    if(hoveredElement.connection.isBusConnection) {
                        console.log("port to bus");

                        lines[lines.length - 1] = new Vector2(hoveredElement.connection.hoveredPoint.x, hoveredElement.connection.hoveredPoint.y);
                        let conn = null;

                        if(lastClickedElement.port.type === "input") {
                            conn = new Connection(null, currentChip, hoveredElement.connection.port1, lastClickedElement.port, lines.reverse());
                        }
                        else {
                            conn = new Connection(null, currentChip, lastClickedElement.port, hoveredElement.connection.port2, lines);
                        }

                        conn.port1.onConnectionAdded();
                        conn.port2.onConnectionAdded();
                        conn.port2.receiveInput(conn.port1.state);

                        if(conn.port1.state === PinState.HIGH) {
                            conn.on = true;
                        }

                        currentChip.addConnection(conn);
                        
                        lines = [];
                        drawing = false;
                        lastClickedElement = null;
                        return;

                    }
                }

                if(hoveredElement === null){
                    const lastPoint = lines[lines.length - 2];
                    const p = mousePos;
                    if (Math.hypot(p.x - lastPoint.x, p.y - lastPoint.y) > 0.001) {
                        lines.push(new Vector2(p.x, p.y));
                    }
                    
                }

                return;
            } else if(!drawing && e.shiftKey) {
                if(hoveredElement === null){
                    drawingBus = true;
                    drawing = true;
                    lines.push(new Vector2(mousePos.x, mousePos.y))
                    if(lines.length === 1) {
                        lines.push(new Vector2(mousePos.x, mousePos.y))
                    }

                    return;
                }
            }


            if(hoveredElement) {

                lastClickedElement = hoveredElement;

                if(lastClickedElement.type === "node") {
                    
                    draggingNode = lastClickedElement.node;
                    

                    dragOffset.x = mousePos.x - draggingNode.position.x;
                    dragOffset.y = mousePos.y - draggingNode.position.y;
                    moveNodeToEnd(draggingNode);

                    if (!selectedNodes.includes(draggingNode)) {
                        if(e.shiftKey){
                            selectedNodes.push(draggingNode);
                            console.log("???")
                        }
                        else
                        {
                            selectedNodes = [];
                            selectedNodes.push(draggingNode);
                        }
                    }
                }
                else if (hoveredElement.type === "port") {

                    selectedNodes = [];
                    lines.push(new Vector2(hoveredElement.port.position.x, hoveredElement.port.position.y))
                    if(lines.length === 1) {
                        lines.push(new Vector2(mousePos.x, mousePos.y))
                    }

                    drawing = true;
                }
                else if(hoveredElement.type === "connection") {
                    selectedNodes = [];

                    if(hoveredElement.connection.isBusConnection) {

                    }
                    else {
                        lines = hoveredElement.connection.getPointsUntilHovered();
                    }
                    
                    lines.push(hoveredElement.connection.hoveredPoint);
                    lines.push(new Vector2(mousePos.x, mousePos.y))
                    if(lines.length === 1) {
                        lines.push(new Vector2(mousePos.x, mousePos.y))
                    }
                    drawing = true;
                }
            }
            else {
                clearInfoBar();
                selectionStart = mousePos;
                selectedNodes = [];
            }
        }
    }
    drawScene();
}

function handleMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPos = screenToWorld(screenX, screenY);
    mousePos = snapToGrid ? snapToGridPoint(worldPos) : worldPos;

    if(draggingNode) {

        let tx = draggingNode.position.x - (mousePos.x - dragOffset.x);
        let ty = draggingNode.position.y - (mousePos.y - dragOffset.y);

        selectedNodes.forEach(node => {
            node.updatePosition(tx, ty);
            
            currentChip.connections.forEach(conn => {

                if(conn.port1 !== null && conn.port2 !== null) {
                    if (conn.port1.node === node || conn.port2.node === node) {
                        conn.updatePosition(tx, ty, node);
                    }
                }
            });
        });

        isDraggingSelection = true;

    }
    else if (isDragging) {
        const dx = screenX - lastMousePos.x;
        const dy = screenY - lastMousePos.y;
        cameraOffset.x += dx;
        cameraOffset.y += dy;
        lastMousePos = { x: screenX, y: screenY };
    } /*else if (drawing && currentLineIndex !== -1 && lines[currentLineIndex].controlPoints.length > 1) {
        lines[currentLineIndex].controlPoints[lines[currentLineIndex].controlPoints.length - 1] = new Vector2(mousePos.x, mousePos.y);
    }*/
    else if (drawing && lines.length > 1) {
        lines[lines.length - 1] = new Vector2(mousePos.x, mousePos.y);
    }

    hoveredElement = detectElementUnderMouse(mousePos);

    if(hoveredElement) {
        document.body.style.cursor = "pointer";
    }else {
        document.body.style.cursor = "default";
    }
    
    drawScene();
}

function handleMouseUp(e) {

    if (selectionStart) {
        selectedNodes = currentChip.nodes.filter(node => 
            node.isInsideBox(selectionStart, mousePos)
        )
    }

    isDragging = false;

    if (e.button === 0) { // Left mouse button
        
        if(hoveredElement) {

            if(hoveredElement.type === "node") {
                if(isDraggingSelection) {
        
                }else if (draggingNode && !e.shiftKey) {
                    selectedNodes = [];
                    selectedNodes.push(hoveredElement.node);
                }

                renderPorts(hoveredElement.node);

            }else if(hoveredElement.type === "connection") {
                renderConnection(hoveredElement.connection);
            }
        }

        

        isDraggingSelection = false;
        selectionStart = null;
        draggingNode = null;

    } else if (e.button === 2) { // Right mouse button
       
    }
    else if(e.button === 1) {
        if(hoveredElement) {

            if(hoveredElement.type === "connection") {
                deleteConnection(hoveredElement.connection);
            }
            else if(hoveredElement.type === "node") {
                if(hoveredElement.node instanceof ChipIONode) {
                    if(hoveredElement.node.type === "input") {
                        hoveredElement.node.switch();
                        //portForward(hoveredElement.node.ports.outputs[0]);
                    }
                }
            }
        }
    }
    
    drawScene();
}

function handleKeyDown(e) {
    
    if (e.key === 'Escape') {
        hideContextMenu(contextMenuConnection);
        hideContextMenu(contextMenuNode);
        hideContextMenu(contextMenuIdle);
        selectedNodes = [];
        if (drawing) {
            if (lines.length > 0) {
                lines = [];
                //lines.pop();
                //currentLineIndex = -1;
            }
            drawing = false;
            drawingBus = false;
            busLineCount = 1;
        }

        popView();
        hoveredElement = detectElementUnderMouse(mousePos);


    }

    if (e.key === 'Shift') {
        snapToGrid = true;
        shiftKeyPressed = true;
    }

    if (e.key === 's' && e.ctrlKey) {
        e.preventDefault();
        console.log("save");
    }

    if (e.key === 'F1' ) {
        e.preventDefault();
        //switchToChip(null);
        createNewChipDialog.showModal();
        console.log("new");
    }

    if (e.key === 'F3') {
        e.preventDefault();
        const openEditGlobalChipDialog = () => {
            globalChipListContainer.innerHTML = ''; // Clear previous items
            chips.forEach(chip => {
                if (chip.name === 'main') {
                    return; // Skip the 'main' chip
                }
                const chipItemDiv = document.createElement('div');
                chipItemDiv.textContent = chip.name;
                chipItemDiv.dataset.id = chip.id;
                chipItemDiv.className = 'global-chip-list-item';
                chipItemDiv.addEventListener('click', () => {
                    const currentlySelected = globalChipListContainer.querySelector('.global-chip-list-item.selected');
                    if (currentlySelected) {
                        currentlySelected.classList.remove('selected');
                    }
                    chipItemDiv.classList.add('selected');
                });
                globalChipListContainer.appendChild(chipItemDiv);
            });
            editGlobalChipDialog.showModal();
        };

        if (currentChip && currentChip.isDirty) {
            pendingChipSwitchAction = openEditGlobalChipDialog;
            saveDiscardTitle.textContent = `Unsaved Changes in "${currentChip.name}"`;
            saveDiscardMessage.textContent = `Chip "${currentChip.name}" has unsaved changes. Save before opening the global chip selector?`;
            saveDiscardChipDialog.showModal();
        } else {
            openEditGlobalChipDialog();
        }
    }

    drawScene();
}

function handleKeyUp(e) {
    if (e.key === 'Shift') {
        snapToGrid = false;
        shiftKeyPressed = false;
    }
    drawScene();
}

function handleWheel(e) {
    e.preventDefault();
    hideContextMenu(contextMenuConnection);
    hideContextMenu(contextMenuNode);
    hideContextMenu(contextMenuIdle);
    const zoom = e.deltaY < 0 ? 1.1 : 0.9;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldMouseX = (mouseX - cameraOffset.x) / cameraZoom;
    const worldMouseY = (mouseY - cameraOffset.y) / cameraZoom;

    if(e.shiftKey) {
        if(e.deltaY < 0 ) {
            console.log("up");
            if(busLineCount < 8) {
                busLineCount += 1;
            }
        }
        else {
            console.log("down");
            if(busLineCount > 1) {
                busLineCount -= 1;
            }
        }
    }
    else {
        cameraZoom *= zoom;

        cameraZoom = clamp(cameraZoom, .3, 1)

        cameraOffset.x = mouseX - worldMouseX * cameraZoom;
        cameraOffset.y = mouseY - worldMouseY * cameraZoom;
    }

    drawScene();
}

function handleDoubleClick(e) {
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPos = screenToWorld(screenX, screenY);
    mousePos = snapToGrid ? snapToGridPoint(worldPos) : worldPos;
    console.log("dblclick")
    

    if(!isDragging && !drawing && !draggingNode) {
        if(hoveredElement) {
            console.log(hoveredElement)
            if(hoveredElement.type === "node") {
                if(hoveredElement.node.chipData){
                    if(hoveredElement.node.chipData.id !== currentChip.id) {
                        switchToChip(hoveredElement.node.chipData);
                        selectedNodes = [];
                        lastClickedElement = null;
                        draggingNode = null;
                        hoveredElement = null;
                        drawScene();
                    }
                }
            }
        }
    }
}

function clamp(number, min, max) {
  return Math.max(min, Math.min(number, max));
}

function renderPorts(node) {

    const sidebar = document.getElementById('infobar');
    sidebar.innerHTML = `<h2>${node.name}</h2>`;


    if(node instanceof LLMNode || node instanceof WebSocketNode) {

        if(node instanceof WebSocketNode) {
            const wsMessageContainer = document.createElement('div');
            wsMessageContainer.id = 'ws-message-container';

            const messageField = document.createElement('input');
            messageField.type = 'text';
            messageField.id = `wsMessage`
            messageField.value = node.message;
            messageField.placeholder = 'Message Name';
            messageField.addEventListener('input', (e) => {
                node.message = e.target.value;  // Update the port name in the node
                if (currentChip) currentChip.markDirty();
            });

            const labelField = document.createElement('label');
            labelField.htmlFor = messageField.id;
            labelField.textContent = "Message Name: "

            const messageFieldDesc = document.createElement('span');
            messageFieldDesc.innerText = "The message-name received by the server."

            wsMessageContainer.appendChild(labelField);
            wsMessageContainer.appendChild(messageField);
            wsMessageContainer.appendChild(document.createElement('br'));
            wsMessageContainer.appendChild(messageFieldDesc);

            sidebar.appendChild(wsMessageContainer);
        }

        const inputPortContainer = document.createElement('div');
        inputPortContainer.id = 'input-ports-container';
        
        let headerContainer = document.createElement('div');
        headerContainer.className = "props-header";
        inputPortContainer.appendChild(headerContainer);

        let hed = document.createElement('h2');
        hed.textContent = "Inputs";

        headerContainer.appendChild(hed);

        // Add a new port section
        const addInputPortButton = document.createElement('button');
        addInputPortButton.textContent = 'Add Input';
        addInputPortButton.addEventListener('click', () => {
            
            node.addPort();
            if (currentChip) currentChip.markDirty();
            drawScene();
            
            currentChip.connections.forEach((c, i) => {
                 if(c.port1.node === node || 
                    c.port2.node === node){
                    
                    c.updatePosition(0, 0, node);
                    drawScene();
                }
            });
            
            renderPorts(node);
        });
        headerContainer.appendChild(addInputPortButton);

        const outputPortContainer = document.createElement('div');
        outputPortContainer.id = 'output-ports-container';

        headerContainer = document.createElement('div');
        headerContainer.className = "props-header";
        outputPortContainer.appendChild(headerContainer);

        hed = document.createElement('h2');
        hed.textContent = "Outputs";

        headerContainer.appendChild(hed);


        const addOutputPortButton = document.createElement('button');
        addOutputPortButton.textContent = 'Add Output';
        addOutputPortButton.addEventListener('click', () => {
            
            node.addPort("output");
            if (currentChip) currentChip.markDirty();
            drawScene();
            
            currentChip.connections.forEach((c, i) => {
                if(c.port1.node === node || 
                    c.port2.node === node){
                    
                    c.updatePosition(0, 0, node);
                    drawScene();
                }
            });
            
            renderPorts(node);
            
        });
        headerContainer.appendChild(addOutputPortButton);

        node.ports.inputs.forEach((port, index) => {
            const portDiv = document.createElement('div');
            portDiv.classList.add('port');

            // Port fields: name, description, type
            const nameField = document.createElement('input');
            nameField.type = 'text';
            nameField.id = `port-name-${index}`
            nameField.value = port.name;
            nameField.placeholder = 'Port Name';
            nameField.addEventListener('input', (e) => {
                port.name = e.target.value;
                if(port.antiPort !== null) {
                    port.antiPort.name = e.target.value;
                }
                if (currentChip) currentChip.markDirty();
            });

            const descField = document.createElement('input');
            descField.type = 'text';
            descField.value = port.description;
            descField.id = `port-desc-${index}`
            descField.placeholder = 'Port Description';
            descField.addEventListener('input', (e) => {
                port.description = e.target.value;  // Update the description
                if (currentChip) currentChip.markDirty();
            });

            // Remove button
            const removeButton = document.createElement('button');
            removeButton.textContent = 'x';
            removeButton.addEventListener('click', () => {
                
                node.ports.inputs.splice(index, 1);
                if (currentChip) currentChip.markDirty();
                drawScene();

                currentChip.connections.forEach((c, i) => {

                    if(c.port1 === port || c.port2 === port) {
                        currentChip.connections.splice(i, 1);
                    }else{
                        c.updatePosition(0, 0, node);
                    }

                });

                
                renderPorts(node);
                drawScene();
            });

            portDiv.appendChild(nameField);
            portDiv.appendChild(descField);
            portDiv.appendChild(removeButton);

            inputPortContainer.appendChild(portDiv);
        });

        node.ports.outputs.forEach((port, index) => {
            const portDiv = document.createElement('div');
            portDiv.classList.add('port');

            // Port fields: name, description, type
            const nameField = document.createElement('input');
            nameField.type = 'text';
            nameField.value = port.name;
            nameField.id = `port-o-name-${index}`
            nameField.placeholder = 'Port Name';
            nameField.addEventListener('input', (e) => {
                port.name = e.target.value;  // Update the port name in the node
                if (currentChip) currentChip.markDirty();
            });

            const descField = document.createElement('input');
            descField.type = 'text';
            descField.value = port.description;
            descField.id = `port-o-desc-${index}`
            descField.placeholder = 'Port Description';
            descField.addEventListener('input', (e) => {
                port.description = e.target.value;  // Update the description
                if (currentChip) currentChip.markDirty();
            });

            // Remove button
            const removeButton = document.createElement('button');
            removeButton.textContent = 'x';
            removeButton.addEventListener('click', () => {
                
                node.ports.outputs.splice(index, 1);
                if (currentChip) currentChip.markDirty();
                drawScene();

                currentChip.connections.forEach((c, i) => {

                    if(c.port1 === port || c.port2 === port) {
                        currentChip.connections.splice(i, 1);
                    }else{
                        c.updatePosition(0, 0, node);
                    }

                });

                drawScene();
                renderPorts(node);
            });

            portDiv.appendChild(nameField);
            portDiv.appendChild(descField);
            portDiv.appendChild(removeButton);

            outputPortContainer.appendChild(portDiv);
        });

        
        sidebar.appendChild(inputPortContainer);
        sidebar.appendChild(outputPortContainer);
    }
    else if(node instanceof ChipIONode) {
        if(node.type === "input") {
            const nameField = document.createElement('input');
            nameField.type = 'text';
            nameField.id = node.ports.outputs[0].id;
            nameField.value = node.ports.outputs[0].name;
            nameField.placeholder = 'Name of Input';
            nameField.addEventListener('input', (e) => {
                node.ports.outputs[0].name = e.target.value;  // Update the port name in the node
                if (currentChip) currentChip.markDirty();
            });

            const labelField = document.createElement('label');
            labelField.htmlFor = nameField.id;
            labelField.textContent = "Name: "

            sidebar.appendChild(labelField);
            sidebar.appendChild(nameField);

        }else {
            const nameField = document.createElement('input');
            nameField.type = 'text';
            nameField.id = node.ports.inputs[0].id;
            nameField.value = node.ports.inputs[0].name;
            nameField.placeholder = 'Name of Output';
            nameField.addEventListener('input', (e) => {
                node.ports.inputs[0].name = e.target.value;  // Update the port name in the node
                if (currentChip) currentChip.markDirty();
            });

            const labelField = document.createElement('label');
            labelField.htmlFor = nameField.id;
            labelField.textContent = "Name: "

            sidebar.appendChild(labelField);
            sidebar.appendChild(nameField);
        }
    }
}

function renderConnection(connection) {

    const sidebar = document.getElementById('infobar');
    sidebar.innerHTML = `<h2>Connection: ${connection.on ? "on": "off"}</h2>`;

    let hed = document.createElement('h2');
    hed.textContent = "History";

    sidebar.appendChild(hed);

    let historyContainer = document.createElement('div');
    historyContainer.className = "connectionHistory";
    sidebar.appendChild(historyContainer);

    hed = document.createElement('h2');
    hed.textContent = "Current Data";

    sidebar.appendChild(hed);

    let dataContainer = document.createElement('div');
    dataContainer.className = "connectionData"

    sidebar.appendChild(dataContainer);
}

function onResize( element ){
  var elementHeight = element.clientHeight,
      elementWidth = element.clientWidth;
  setInterval(function(){
      if( element.clientHeight !== elementHeight || element.clientWidth !== elementWidth ){
        elementHeight = element.clientHeight;
        elementWidth = element.clientWidth;
        fitToContainer(element);
        drawScene();
      }
  }, 300);
}
onResize(canvas);

function addListener(node) {
    listeners.push(node);
}

const createNewChipDialog = document.getElementById("newChipDialog");
let cancelNewChipBtn = document.getElementById('cancelNewChip');
let dialogCloseButton = document.getElementById('dialogCloseButton');
let saveNewChipButton = document.getElementById('saveNewChip');

cancelNewChipBtn.addEventListener("click", (e) => {
    createNewChipDialog.close();
});

dialogCloseButton.addEventListener("click", (e) => {
    createNewChipDialog.close();
});

saveNewChipButton.addEventListener("click", (e) => {
    // Assume an input field with ID 'chipNameInput' exists in your dialog HTML
    const chipNameInput = document.getElementById('chipNameInput');
    if (!chipNameInput) {
        console.error("Chip name input field (id='chipNameInput') not found in the dialog.");
        alert("Error: Chip name input field not found.");
        return;
    }
    const chipName = chipNameInput.value.trim();

    if (!chipName) {
        alert("Chip name cannot be empty.");
        chipNameInput.focus();
        return;
    }

    const existingChip = chips.find(c => c.name === chipName);
    if (existingChip) {
        alert(`A chip with the name "${chipName}" already exists. Please choose a different name.`);
        chipNameInput.focus();
        return;
    }

    const newChip = new Chip(null, chipName);
    addChip(newChip);

    const action = () => {
        if (currentChip) {
            viewStack.push(currentChip);
        }
        currentChip = newChip;
        updateViewPath();
        reset();
        drawScene();
        if (chipNameInput) chipNameInput.value = ''; 
        createNewChipDialog.close();
    };
    
    if (currentChip && currentChip.isDirty) {
        pendingChipSwitchAction = action;
        saveDiscardTitle.textContent = `Unsaved Changes in "${currentChip.name}"`;
        saveDiscardMessage.textContent = `Chip "${currentChip.name}" has unsaved changes. Save before creating and switching to "${chipName}"?`;
        saveDiscardChipDialog.showModal();
    } else {
        action();
    }
});


if (cancelSelectGlobalChip) {
    cancelSelectGlobalChip.addEventListener('click', () => {
        editGlobalChipDialog.close();
    });
}

if (closeEditGlobalChipDialog) {
    closeEditGlobalChipDialog.addEventListener('click', () => {
        editGlobalChipDialog.close();
    });
}

if (selectGlobalChipButton) {
    selectGlobalChipButton.addEventListener('click', () => {
        const selectedChipItem = globalChipListContainer.querySelector('.global-chip-list-item.selected');
        if (selectedChipItem) {
            const chipId = selectedChipItem.dataset.id;
            const chipToSelect = chips.find(c => c.id === chipId);

            if (chipToSelect) {
                const action = () => {
                    if (currentChip && currentChip.id !== chipToSelect.id) {
                        viewStack.push(currentChip);
                    }
                    currentChip = chipToSelect;
                    updateViewPath();
                    reset();
                    drawScene();
                    editGlobalChipDialog.close();
                };

                if (currentChip && currentChip.isDirty && currentChip.id !== chipToSelect.id) {
                    pendingChipSwitchAction = action;
                    saveDiscardTitle.textContent = `Unsaved Changes in "${currentChip.name}"`;
                    saveDiscardMessage.textContent = `Chip "${currentChip.name}" has unsaved changes. Save before switching to "${chipToSelect.name}"?`;
                    saveDiscardChipDialog.showModal();
                } else {
                    action(); // No unsaved changes or switching to the same chip
                }
            } else {
                console.error("Selected chip not found in chips array.");
                alert("Error: Could not find the selected chip.");
            }
        } else {
            alert("Please select a chip from the list.");
        }
    });
}

function saveGlobalChipChanges(chipToSave) {
    if (!chipToSave) return;

    chips.forEach(chipInstance => {
        chipInstance.nodes.forEach(node => {
            if (node instanceof ChipNode && node.chipData && node.chipData.id === chipToSave.id) {
                // Update the chipData reference for this instance
                node.chipData = chipToSave; 
                // Resync ports based on the new chipData
                node.resyncPortsFromChipData();
                // Mark the chip instance containing this ChipNode as dirty, as its structure might have changed
                if (chipInstance.id !== chipToSave.id) { // Don't mark the chip being saved as dirty again by itself
                  chipInstance.markDirty();
                }
            }
        });
    });
    drawScene(); // Refresh the scene as node appearances might change
}

// Event listeners for saveDiscardChipDialog
if (saveChipButton) {
    saveChipButton.addEventListener('click', () => {
        if (currentChip) {
            saveGlobalChipChanges(currentChip); // Save changes to all instances
            console.log(`Saved changes for chip: ${currentChip.name} and updated instances.`);
            currentChip.clearDirty(); // Mark as no longer dirty
        }
        saveDiscardChipDialog.close();
        if (pendingChipSwitchAction) {
            pendingChipSwitchAction();
            pendingChipSwitchAction = null;
        }
    });
}

if (discardChipButton) {
    discardChipButton.addEventListener('click', () => {
        if (currentChip) {
            currentChip.clearDirty(); // Mark as no longer dirty, changes are discarded
        }
        saveDiscardChipDialog.close();
        if (pendingChipSwitchAction) {
            pendingChipSwitchAction();
            pendingChipSwitchAction = null;
        }
    });
}

if (cancelSaveDiscardButton) {
    cancelSaveDiscardButton.addEventListener('click', () => {
        pendingChipSwitchAction = null; // Cancel the pending action
        saveDiscardChipDialog.close();
    });
}

if (closeSaveDiscardDialog) {
    closeSaveDiscardDialog.addEventListener('click', () => {
        pendingChipSwitchAction = null; // Also cancel if closed via 'X'
        saveDiscardChipDialog.close();
    });
}


const webSocketInput = document.getElementById("webSocketInput");
const webSocketConnectBtn = document.getElementById("webSocketConnectBtn");
const webSocketStatus = document.getElementById("webSocketStatus");

webSocketConnectBtn.addEventListener("click", (e) => {
    e.preventDefault();

    if(webSocketInput.value === "") {
        console.error("host must be provided");
        return;
    }

    if(socket === null) {

        socket = new WebSocket(`ws://${webSocketInput.value}`);

        socket.addEventListener("open", (event) => {
            webSocketStatus.innerText = "Connected";
            webSocketConnectBtn.innerText = "Disconnect";
        });

        socket.addEventListener("message", (event) => {
            console.log(event.data);
        });

        socket.addEventListener("error", (event) => {
            socket = null;
            webSocketStatus.innerText = "Not Connected";
            webSocketConnectBtn.innerText = "Connect";
        });

        socket.addEventListener("close", (event) => {
            socket = null;
            webSocketStatus.innerText = "Not Connected";
            webSocketConnectBtn.innerText = "Connect";
        });

    }
    else {
        socket.close();
        socket = null;
    }

});


// Event listeners
canvas.addEventListener('mousedown', handleMouseDown);
canvas.addEventListener('dblclick', handleDoubleClick);
canvas.addEventListener('mousemove', handleMouseMove);
canvas.addEventListener('mouseup', handleMouseUp);
canvas.addEventListener('wheel', handleWheel);
document.addEventListener('keydown', handleKeyDown);
document.addEventListener('keyup', handleKeyUp);
document.addEventListener('click', (e) => {
    
    /*if (e.target !== contextMenuConnection && !contextMenuConnection.contains(e.target)) {
        hideContextMenu(contextMenuConnection);
    }

    if (e.target !== contextMenuNode && !contextMenuNode.contains(e.target)) {
        hideContextMenu(contextMenuNode);
    } 

    if (e.target !== contextMenuIdle && !contextMenuIdle.contains(e.target)) {
        hideContextMenu(contextMenuIdle);
    }*/
});

// context menu
canvas.addEventListener('contextmenu', (e) => {

    e.preventDefault();
    if(drawingBus || drawing) {

        if(drawingBus) {
            const connLines = getParallelLines(lines);
            
            connLines.forEach(line => {
                let conn = new Connection(null, currentChip, null, null, line);
                currentChip.addConnection(conn);
            });
        }
        drawingBus = false;
        lines = [];
        busLineCount = 1;
        drawing = false;
        drawScene();
        return;
    }

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPos = screenToWorld(screenX, screenY);

    hoveredElement = detectElementUnderMouse(worldPos);

    hideContextMenu(contextMenuIdle);
    hideContextMenu(contextMenuConnection);
    hideContextMenu(contextMenuNode);

    if(isDraggingSelection) return;

    if (hoveredElement && hoveredElement.type === 'connection') {
        selectedConnection = hoveredElement.connection;
        showContextMenu(contextMenuConnection, e.clientX+ 1, e.clientY+ 1);
    } else if (hoveredElement && hoveredElement.type === 'node') {
        

        deleteNodeBtn.innerText = "Delete Node";
        selectedNode = hoveredElement.node;
        
        if(selectedNodes.includes(selectedNode)) {
            if(selectedNodes.length > 1) {
                deleteNodeBtn.innerText = "Delete Nodes";
            }
        }
        else {
            selectedNodes = [];
            selectedNodes.push(hoveredElement.node);
        }

        drawScene();

        showContextMenu(contextMenuNode, e.clientX + 1, e.clientY + 1);
    } else if(!hoveredElement) {
        showContextMenu(contextMenuIdle, e.clientX + 1, e.clientY + 1);

        const searchInput = document.getElementById('nodeSearchInput');
        const searchResultsDiv = document.getElementById('searchResults');

        if (searchInput) {
            searchInput.value = '';
            searchSelectedIndex = 0;
            searchResultsDiv.scrollTop = 0;
            updateSearchResults('');
            updateSelection();
            searchInput.focus();
        }
    }

});

canvas.addEventListener('mouseout', (e) => {
    //reset();
    document.body.style.cursor = "default";
    drawScene();
    console.log("out");
});

drawScene();
initializeSearch();