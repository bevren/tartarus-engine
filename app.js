// Helper function to generate a UUID (v4)
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Vector2 class (simplified version of Pygame's Vector2)
class Vector2 {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    add(other) {
        return new Vector2(this.x + other.x, this.y + other.y);
    }

    subtract(other) {
        return new Vector2(this.x - other.x, this.y - other.y);
    }

    multiply(scalar) {
        return new Vector2(this.x * scalar, this.y * scalar);
    }

    magnitude() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    normalize() {
        const mag = this.magnitude();
        if (mag === 0) return new Vector2(0, 0);
        return new Vector2(this.x / mag, this.y / mag);
    }

    lerp(other, t) {
        return new Vector2(
            this.x + (other.x - this.x) * t,
            this.y + (other.y - this.y) * t
        );
    }

    perpendicular() {
        return new Vector2(-this.y, this.x);
    }

    dot(other) {
        return this.x * other.x + this.y * other.y;
    }

    rotate(angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return new Vector2(
            this.x * cos - this.y * sin,
            this.x * sin + this.y * cos
        );
    }

    cross(other) {
        return this.x * other.y - this.y * other.x;
    }
}

class Node {
    constructor(id, chipBelongsTo, name) {
        this.id = id || generateUUID();
        this.name = name;
        this.position = new Vector2(0, 0);
        this.ports = {
            inputs: [],
            outputs: []
        };
        this.width = 120;
        this.maxWidth = 120;
        this.baseHeight = 20;  // Minimum height for the node
        this.portHeight = 20;  // Height added per port
        
        this.chipBelongsTo = chipBelongsTo;
        this.chipData = null;
        this.chipId = null;
        this.parentChip = null;

        this.height = 0;
        this.padding = 5;
        this.numInputsReceived = 0;
        this.inputValues = new Set();
    }

    isUnderMouse(mousePos) {
        return mousePos.x >= this.position.x && mousePos.x <= this.position.x + this.width &&
               mousePos.y >= this.position.y && mousePos.y <= this.position.y + this.calculateHeight();
    }
    
    addPort(type = 'input', name = "Untitled") {
        const port = new Port(null, this, type, name);
        port.chipBelongsTo = this.chipBelongsTo;
        if (type === 'input') {
            this.ports.inputs.push(port);
        } else {
            this.ports.outputs.push(port);
        }

        return port;
    }

    removePort(portId) {
        let found = false;
        this.ports.inputs = this.ports.inputs.filter(p => {
            if (p.id === portId) { found = true; return false; }
            return true;
        });
        if (!found) {
            this.ports.outputs = this.ports.outputs.filter(p => {
                if (p.id === portId) { found = true; return false; }
                return true;
            });
        }
        if (found) {
            this.height = this.calculateHeight();
            this.updatePortPositions();
            // Also need to remove connections attached to this port from the chip
            if (this.chipBelongsTo) {
                this.chipBelongsTo.connections = this.chipBelongsTo.connections.filter(conn => {
                    const connected = (conn.port1 && conn.port1.id === portId) || (conn.port2 && conn.port2.id === portId);
                    if (connected) { // Notify other end of connection if it exists
                        if (conn.port1 && conn.port1.id === portId && conn.port2) conn.port2.onConnectionRemoved();
                        if (conn.port2 && conn.port2.id === portId && conn.port1) conn.port1.onConnectionRemoved();
                    }
                    return !connected;
                });
            }
        }
    }

    calculateHeight() {
        const maxPortCount = Math.max(this.ports.inputs.length, this.ports.outputs.length);
        return this.baseHeight + (maxPortCount * this.portHeight) + 2 * this.padding;
    }

    updatePosition(offsetX, offsetY) {
        this.position = new Vector2(this.position.x - offsetX, this.position.y - offsetY);
    }

    calculateWidth(ctx) {
        const words = this.name.split(" ");
        let currentLineWidth = 0;
        let maxLineWidth = 0;
        let lines = 1;

        ctx.font = '18px Arial'; // Use the same font as for drawing

        for (const word of words) {
            const wordWidth = ctx.measureText(word).width;
            if (currentLineWidth + wordWidth > this.maxWidth - 2 * this.padding) {
                lines++;
                maxLineWidth = Math.max(maxLineWidth, currentLineWidth);
                currentLineWidth = wordWidth + ctx.measureText(" ").width;;
            }else {
                currentLineWidth += wordWidth + ctx.measureText(" ").width; // Add space width
            }
        }

        maxLineWidth = Math.max(maxLineWidth, currentLineWidth); // Get the width of the last line
        this.width =  Math.max(this.maxWidth, maxLineWidth + 2 * this.padding); // Ensure width is at least maxWidth
        this.lines = lines; // Store the number of lines for drawing
        return this.width;

    }

    draw(ctx) {

        this.calculateWidth(ctx);
        this.height = this.calculateHeight();

        // Draw the node (rectangle)
        ctx.fillStyle = 'lightblue';
        ctx.fillRect(this.position.x, this.position.y, this.width, this.height);
        ctx.strokeStyle = 'black';
        ctx.strokeRect(this.position.x, this.position.y, this.width, this.height);


        // Draw the node's name (with wrapping)
        const words = this.name.split(" ");
        let lines = []; // Store words for each line
        let currentLine = [];
        let currentLineWidth = 0;
        
        /*// Draw the node's name
        const textWidth = ctx.measureText(this.name).width;
        const textX = this.position.x + (this.width - textWidth) / 2 - 5;
        const textY = this.position.y + (this.height / 2) + 5;*/
        ctx.save();
        ctx.fillStyle = 'black';
        ctx.font = 'bold 18px Consolas';
        const lineHeight = 18;

        for (const word of words) {
            const wordWidth = ctx.measureText(word).width;
            if (currentLineWidth + wordWidth > this.width - 2 * this.padding) {
                lines.push(currentLine);
                currentLine = [];
                currentLineWidth = 0;
            }
            currentLine.push(word);
            currentLineWidth += wordWidth + ctx.measureText(" ").width;
        }
        lines.push(currentLine); // Add the last line
        
        let lineY = this.position.y + this.padding + (this.height - 2 * this.padding - (lines.length * lineHeight)) / 2 + lineHeight/2 + 5;

        for (const line of lines) {
            const lineText = line.join(" ");
            const lineWidth = ctx.measureText(lineText).width;
            const xOffset = (this.width - lineWidth + 10) / 2; // Calculate x offset for centering
            ctx.fillText(lineText, this.position.x + xOffset - 5, lineY);
            lineY += lineHeight;
        }

        ctx.restore();

        this.ports.inputs.forEach((port, index) => {
            port.calculatePosition(this.width, this.height, index, this.ports.inputs.length);
            //port.draw(ctx, this.position);
        });

        this.ports.outputs.forEach((port, index) => {
            port.calculatePosition(this.width, this.height, index, this.ports.outputs.length);
            //port.draw(ctx, this.position);
        });
    }

    isInsideBox(start, end) {

        const nodeLeft = this.position.x;
        const nodeRight = this.position.x + this.width;
        const nodeTop = this.position.y;
        const nodeBottom = this.position.y + this.height;

        const boxLeft = Math.min(start.x, end.x);
        const boxRight = Math.max(start.x, end.x);
        const boxTop = Math.min(start.y, end.y);
        const boxBottom = Math.max(start.y, end.y);

        return !(nodeLeft > boxRight || nodeRight < boxLeft || nodeTop > boxBottom || nodeBottom < boxTop);
    }

    run() {
        
    }

    canRun() {
        let result = true;
        this.ports.inputs.forEach(p => {
            if(p.floating) result = false;
        });

        return result;
    }

    inputReceived(portId) {

        if(this.canRun())
            this.run();
        
        this.numInputsReceived += 1;

        if(this.numInputsReceived === this.ports.inputs.length) {
            
            this.numInputsReceived = 0;
        }
    }

    inputRemoved(portId) {
        if(this.inputValues.has(portId)) {
            this.inputValues.delete(portId);
        }
    }

    getAllPorts() {
        return [...this.ports.inputs, ...this.ports.outputs];
    }

    serialize() {
        return {
            id: this.id,
            chipBelongsTo: this.chipBelongsTo,
            parentChip: this.parentChip,
            name: this.name,
            position: { x: this.position.x, y: this.position.y },
            ports: {
                inputs: this.ports.inputs.map(p => p.serialize()),
                outputs: this.ports.outputs.map(p => p.serialize())
            }
        };
    }

    
    static deserialize(data) {
        const node = new Node(data.name, data.position.x, data.position.y);
        node.id = data.id;
        for (const portData of data.ports.inputs) {
            node.ports.inputs.push(Port.deserialize(portData, node));
        }
        for (const portData of data.ports.outputs) {
            node.ports.outputs.push(Port.deserialize(portData, node));
        }
        return node;
    }


}

class Connection {
    constructor(id, chipBelongsTo, port1, port2, points) {
        this.id = id || generateUUID();
        this.port1 = port1;
        this.port2 = port2;
        this.points = points;
        this.on = false;
        this.data = null;
        this.history = [];
        this.isBusConnection = port1 === null && port2 === null;
        this.hoveredPoint = null;
        this.hoveredSegmentIndex = -1;
        this.chipBelongsTo = chipBelongsTo;

        //constructor(id, node, type = 'input', name = "Untitled")
        
        if(this.isBusConnection){
            if(this.port1 === null) {
                this.port1 = new Port(null, null, "output");
                this.port1.position = this.points[0];
                this.port1.isBusPort = true;
                this.port1.chipBelongsTo = this.chipBelongsTo;
            }

            if(this.port2 === null) {
                this.port2 = new Port(null, null, "input");
                this.port2.position = this.points[this.points.length - 1];
                this.port2.isBusPort = true;
                this.port2.chipBelongsTo = this.chipBelongsTo;
            }
        }
    }



    isUnderMouse(mousePos) {
        const threshold = 8; // Distance threshold for detecting proximity to the line
        let closestDistance = Infinity;
        let closestPoint = null;
        let closestSegmentIndex = -1;
        let closestParam = 0;

        for (let i = 0; i < this.points.length - 1; i++) {
            const p1 = this.points[i];
            const p2 = this.points[i + 1];
            const { distance, closestPoint: point, param } = this._getDistanceFromLineSegment(mousePos, p1, p2);
            if (distance <= threshold && distance < closestDistance) {
                closestDistance = distance;
                closestPoint = point;
                closestSegmentIndex = i;
                closestParam = param;
            }
        }

        if (closestPoint) {
            this.hoveredPoint = closestPoint;
            this.hoveredSegmentIndex = closestSegmentIndex;
            this.hoveredParam = closestParam;
            return true;
        }

        this.hoveredPoint = null;
        this.hoveredSegmentIndex = -1;
        this.hoveredParam = 0;
        return false;
    }

    getTotalLength() {
        return this.points.reduce((total, point, index, points) => {
            if (index === 0) return total;
            return total + this.getDistance(points[index - 1], point);
        }, 0);
    }

    getDistance(point1, point2) {
        const dx = point2.x - point1.x;
        const dy = point2.y - point1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    updatePosition(offsetX, offsetY, draggingNode) {
        const startNodeIsDragging = this.port1.isBusPort ? false : this.port1.node.id === draggingNode.id;
        const endNodeIsDragging =  this.port2.isBusPort ? false : this.port2.node.id === draggingNode.id;
        
        const numPoints = this.points.length;
        const centerX = this.points.reduce((sum, p) => sum + p.x, 0) / numPoints;
        const centerY = this.points.reduce((sum, p) => sum + p.y, 0) / numPoints;

        this.points = this.points.map((point, index, points) => {
            if (index === 0) {
                if(this.port1.isBusPort) {
                    return new Vector2(point.x, point.y);
                }
                return new Vector2(this.port1.position.x, this.port1.position.y);
            } else if (index === numPoints - 1) {
                if(this.port2.isBusPort) {
                    return new Vector2(point.x, point.y);
                }
                return new Vector2(this.port2.position.x, this.port2.position.y);
            }

            let moveX, moveY;
            const factor = (index) / (numPoints - 1);

            if (startNodeIsDragging && endNodeIsDragging) {
                moveX = offsetX;
                moveY = offsetY;
            } else if (startNodeIsDragging) {    
                moveX = offsetX * (1-factor); 
                moveY = offsetY * (1-factor);
            } else {
                moveX = offsetX * factor;  
                moveY = offsetY * factor;
            }

             // Calculate vector from center to current point
            const dx = point.x - centerX;
            const dy = point.y - centerY;

            // Apply offset and maintain distance from center
            const newX = (centerX + dx) - moveX;
            const newY = (centerY + dy) - moveY;

            // Apply the offset
            return new Vector2(newX, newY);
        });
    }

    _getDistanceFromLineSegment(point, p1, p2) {
        const A = point.x - p1.x;
        const B = point.y - p1.y;
        const C = p2.x - p1.x;
        const D = p2.y - p1.y;

        const dot = A * C + B * D;
        const len_sq = C * C + D * D;
        const param = (len_sq !== 0) ? (dot / len_sq) : -1;

        let xx, yy;

        if (param < 0) {
            xx = p1.x;
            yy = p1.y;
        } else if (param > 1) {
            xx = p2.x;
            yy = p2.y;
        } else {
            xx = p1.x + param * C;
            yy = p1.y + param * D;
        }

        const dx = point.x - xx;
        const dy = point.y - yy;
        return {
            distance: Math.sqrt(dx * dx + dy * dy),
            closestPoint: new Vector2(xx, yy),
            param: param
        };
    }

    getPointsUntilHovered() {
        if (this.hoveredSegmentIndex === -1) return [];

        let result = this.points.slice(0, this.hoveredSegmentIndex + 1);


        return result;
    }

    draw(ctx) {

    }
    
    serialize() {
        return {
            id: this.id,
            port1Id: this.port1.id,
            port2Id: this.port2.id,
            points: this.points
        };
    }

    static deserialize(data, ports) {
        const port1 = ports.find(p => p.id === data.port1Id);
        const port2 = ports.find(p => p.id === data.port2Id);
        const points = data.points;
        return new Connection(port1, port2, points);
    }

    clone(newChipBelongsTo, portIdMap) {
        const clonedP1Ref = this.port1 ? portIdMap.get(this.port1.id) : null;
        const clonedP2Ref = this.port2 ? portIdMap.get(this.port2.id) : null;
        
        const clonedPoints = this.points.map(p => new Vector2(p.x, p.y));

        const clonedConnection = new Connection(
            null, // Generates new ID
            newChipBelongsTo,
            clonedP1Ref,
            clonedP2Ref,
            clonedPoints
        );

        clonedConnection.on = this.on;
        clonedConnection.data = JSON.parse(JSON.stringify(this.data)); // Simple deep copy for data
        clonedConnection.history = JSON.parse(JSON.stringify(this.history));
        
        return clonedConnection;
    }
}

class PinState {
    // Private Fields
    static #_LOW = 0;
    static #_HIGH = 1;
    static #_FLOATING = 2;

    // Accessors for "get" functions only (no "set" functions)
    static get HIGH() { return this.#_HIGH; }
    static get LOW() { return this.#_LOW; }
    static get FLOATING() { return this.#_FLOATING; }
}

class Port {
    constructor(id, node, type = 'input', name = "Untitled") {
        this.id = id || generateUUID();
        this.node = node;
        this.type = type;
        
        this.radius = 8;
        this.name = name;
        this.state = PinState.FLOATING;
        this.data = "";
        this.showName = false;
        this.description = "";
        this.numInputs = 0;
        this.floating = true;
        this.numInputsReceivedSinceSignalPropagated = 0;
        this.nextState = PinState.FLOATING;
        this.isBusPort = false;
        this.chipBelongsTo = null;
        this.antiPort = null;

        if(node === null) {
            this.position = new Vector2(0,0);
        }else {
            this.position = node.position;
        }
    }

    receiveInput(state) {
        
        if(this.type === "input") {
            if(this.nextState === PinState.FLOATING) {
                this.nextState = state;
            }
            else if(state !== PinState.FLOATING){
                console.log("pin is not floating and some input received.");
                //this.nextState = Math.random() < 0.5 ? this.nextState : state;
            }
            this.propagateSignal();

            //TODO
            this.numInputsReceivedSinceSignalPropagated += 1;

            if(this.numInputsReceivedSinceSignalPropagated >= this.numInputs) {
                
            }
        }
        else {
             this.nextState = state;
             this.propagateSignal();
        }
    }

    propagateSignal() {
        
        this.state = this.nextState;
        this.nextState = PinState.FLOATING;

        if(!this.isBusPort) {
            if(this.type === "input") {
                this.node.inputReceived(this.id);
                //console.log("HEY")
            }
            else {
                this.chipBelongsTo.connections.forEach(conn => {

                    if(conn.port1 && conn.port2) {
                        if(conn.port1.id === this.id) {
                            conn.port2.receiveInput(this.state);
                            conn.on = this.state === PinState.HIGH ? true : false;
                            if(conn.port2.antiPort) {
                                conn.port2.antiPort.receiveInput(this.state);
                            }
                        }
                    }
                });
            }

        }
        else {

            if(this.type === "input") {
                this.chipBelongsTo.connections.forEach(conn => {
                    if(conn.port2.id === this.id) {
                        if(conn.isBusConnection) {
                            conn.port1.receiveInput(this.state);
                            conn.on = this.state === PinState.HIGH ? true : false;
                        }
                    }
                });
            }
            else {
                this.chipBelongsTo.connections.forEach(conn => {
                    if(conn.port1.id === this.id) {
                        if(!conn.isBusConnection) {
                            conn.port2.receiveInput(this.state);
                            conn.on = this.state === PinState.HIGH ? true : false;
                        }
                    }
                });

            }

        }

        
        this.numInputsReceivedSinceSignalPropagated = 0;
    }

    isUnderMouse(mousePos, nodePosition) {
        const radius = this.radius; // Port radius for detection area
        const portCenter = {
            x: this.position.x,
            y: this.position.y
        };

        const dist = Math.hypot(mousePos.x - portCenter.x, mousePos.y - portCenter.y);
        return dist <= radius;
    }

    calculatePosition(nodeWidth, nodeHeight, portIndex, totalPorts) {

        if(this.isBusPort) return;

        const verticalSpacing = nodeHeight / (totalPorts + 1);
        const yOffset = verticalSpacing * (portIndex + 1);

        if(this.node instanceof ChipIONode) {
            if (this.type === 'input') {
                this.position = { x: this.node.position.x - this.node.radius * 2, y: this.node.position.y };
            } else {
                // Output ports on the right side of the node
                this.position = { x: this.node.position.x + this.node.radius * 2, y: this.node.position.y };
            }
        }
        else {
            if (this.type === 'input') {
                // Input ports on the left side of the node
                this.position = { x: this.node.position.x, y: this.node.position.y + yOffset };
            } else {
                // Output ports on the right side of the node
                this.position = { x: this.node.position.x + nodeWidth, y: this.node.position.y + yOffset };
            }
        }
    }

    displayName(ctx) {
        ctx.save();
            
        ctx.font = '14px Arial';
        const lineHeight = 18;
        const padding = 8;

        const textWidth = ctx.measureText(this.name).width;
        const direction = this.type === "input" ? -(textWidth + 10 + padding * 2) : 10;
        ctx.fillStyle = 'black';
        ctx.fillRect(this.position.x + direction, this.position.y - lineHeight/2, textWidth + padding * 2, lineHeight);
        ctx.fillStyle = 'white';
        if(this.antiPort === null) {
            ctx.fillText(this.name, this.position.x + direction + padding, this.position.y + 5);
        }
        else {
            ctx.fillText(this.name, this.position.x + direction + padding, this.position.y + 5);
        }
        ctx.restore();
    }

    onConnectionAdded() {
        this.numInputs += 1;
        this.floating = false;
    }

    onConnectionRemoved() {

        if(this.type === "input" && this.node){
            this.node.inputRemoved(this.id);
        }
        
        this.numInputs -= 1;
        this.floating = this.numInputs === 0;

        if(this.floating) {
            //this.nextState = PinState.FLOATING;
            //this.state = PinState.FLOATING;
        }
    }

    draw(ctx, isHovered) {
        ctx.save();
        
        if(isHovered) {
            ctx.fillStyle = 'rgb(128,128,128)';
        }
        else {
            if(this.floating) {
                ctx.fillStyle = 'yellow';
            }
            else if(this.state === PinState.LOW) {
                ctx.fillStyle = 'red';
            }
            else if(this.state === PinState.HIGH) {
                ctx.fillStyle = 'green';
            }
        }

        if(this.isBusPort) {
            const size = 13;
            ctx.fillRect(this.position.x - size * 0.5, this.position.y - size * 0.5, size, size);
        }
        else {
            ctx.beginPath();
        
            ctx.arc(
               this.position.x,
               this.position.y,
               this.radius, 0, 2 * Math.PI
            );
            ctx.fill();
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    serialize() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            nodeId: this.node.id,
            type: this.type,
            position: { x: this.position.x, y: this.position.y }
        };
    }

    
    static deserialize(data, node) {
        const port = new Port(null, node, data.type);
        port.id = data.id;
        port.position = new Vector2(data.position.x, data.position.y);
        return port;
    }

    clone(newOwningNode, newChipBelongsTo) {
        const clonedPort = new Port(
            null, // Generates new ID
            newOwningNode,
            this.type,
            this.name
        );

        clonedPort.radius = this.radius;
        // State should be reset for a clone, or copied if that's desired behavior.
        // Resetting state is safer for a fresh clone.
        clonedPort.state = this.state;
        clonedPort.nextState = this.nextState;
        clonedPort.data = JSON.parse(JSON.stringify(this.data)); // Simple deep copy
        clonedPort.showName = this.showName;
        clonedPort.description = this.description;
        clonedPort.isBusPort = this.isBusPort;
        clonedPort.chipBelongsTo = newChipBelongsTo;
        
        // Position should be based on the new owning node or wire,
        // but for simplicity, copy relative offset or let calculatePosition handle it later.
        // If it's a bus port, its position is part of the connection's points.
        clonedPort.position = new Vector2(this.position.x, this.position.y); // Copy position, may need recalculation

        // numInputs and floating will be reset and recalculated when connections are cloned.
        clonedPort.numInputs = this.numInputs;
        clonedPort.floating = this.floating;
        clonedPort.numInputsReceivedSinceSignalPropagated = this.numInputsReceivedSinceSignalPropagated;

        // Store original antiPort ID for relinking after all ports in the chip are cloned
        if (this.antiPort) {
            clonedPort._originalAntiPortId = this.antiPort.id;
            clonedNode.antiPort = this.antiPort;
        }
        
        return clonedPort;
    }
}

class ChipIONode extends Node {
    constructor(chip, type="input") {
        super(null, chip, type);
        this.type = type;
        this.radius = 32;
        this.addPort(this.type === "input" ? "output" : "input");
        this.on = 0;
    }

    draw(ctx) {
        const port = this.type === "input" ? this.ports.outputs[0] : this.ports.inputs[0];
        port.calculatePosition(this.width, this.height, 0, 1);
        
        
        ctx.beginPath();
        ctx.moveTo(this.position.x, this.position.y);

        ctx.lineTo(port.position.x, port.position.y);
        
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.stroke();
        

        ctx.beginPath();
        ctx.arc(
            this.position.x,
            this.position.y,
            this.radius, 0, 2 * Math.PI
        );

        ctx.strokeStyle = 'black';
        ctx.fillStyle = this.type === 'input' ? this.on ? 'rgb(128,128,128)' : 'rgb(48,48,48)' : 'black';
        ctx.fill();
        ctx.stroke();

        ctx.save();
        ctx.font = '14px Arial';  
        ctx.fillStyle = 'white';  
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.type, this.position.x, this.position.y);
        ctx.restore();


        
    }

    switch() {
        if(this.type !== "input") return;
        
        this.on = this.on === PinState.HIGH ? PinState.LOW : PinState.HIGH;
        this.ports.outputs[0].receiveInput(this.on);
    }

    isUnderMouse(mousePos) {
        const dx = mousePos.x - this.position.x;
        const dy = mousePos.y - this.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        return distance <= this.radius;
    }

    isInsideBox(start, end) {
        const boxLeft = Math.min(start.x, end.x);
        const boxRight = Math.max(start.x, end.x);
        const boxTop = Math.min(start.y, end.y);
        const boxBottom = Math.max(start.y, end.y);

        const nodeCenterX = this.position.x;
        const nodeCenterY = this.position.y;
        const radius = this.radius;

        const circleLeft = nodeCenterX - radius;
        const circleRight = nodeCenterX + radius;
        const circleTop = nodeCenterY - radius;
        const circleBottom = nodeCenterY + radius;

        if (circleRight < boxLeft || circleLeft > boxRight || circleBottom < boxTop || circleTop > boxBottom) {
            return false;
        }

        const closestX = Math.max(boxLeft, Math.min(nodeCenterX, boxRight));
        const closestY = Math.max(boxTop, Math.min(nodeCenterY, boxBottom));

        const distanceX = nodeCenterX - closestX;
        const distanceY = nodeCenterY - closestY;
        const distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);

        return distanceSquared <= (radius * radius);
    }

    clone() {
        
        let clonedNode = new ChipIONode(this.chipBelongsTo, this.type);
        
        clonedNode.position = new Vector2(this.position.x, this.position.y);
        clonedNode.chipData = this.chipData; // Shallow copy of chipData reference
        clonedNode.chipId = this.chipId;
        clonedNode.parentChip = this.parentChip; // Shallow copy, might need context adjustment

        clonedNode.numInputsReceived = 0;
        clonedNode.inputValues = new Map();
        clonedNode.type = this.type;
        clonedNode.on = this.on;

        clonedNode.ports.inputs = []; 
        clonedNode.ports.outputs = [];

        this.ports.inputs.forEach(originalPort => {
            const clonedPort = originalPort.clone(clonedNode, this.chipBelongsTo);
            clonedNode.ports.inputs.push(clonedPort);
        });
        this.ports.outputs.forEach(originalPort => {
            const clonedPort = originalPort.clone(clonedNode, this.chipBelongsTo);
            clonedNode.ports.outputs.push(clonedPort);
        });
        
        
        return clonedNode;
    }
}

class AndNode extends Node {
    constructor(chip) {
        super(null, chip, "AND");
        this.addPort("input", "A");
        this.addPort("input", "B");
        this.addPort("output", "A && B");
    }

    run() {

        console.log("AND NODE RUN", this.id);
        let result = this.ports.inputs[0].state === PinState.HIGH && this.ports.inputs[1].state === PinState.HIGH;
        this.ports.outputs[0].receiveInput(result ? PinState.HIGH : PinState.LOW);
    }

    clone() {
        
        let clonedNode = new AndNode(this.chipBelongsTo);
        
        clonedNode.position = new Vector2(this.position.x, this.position.y);
        clonedNode.chipData = this.chipData; // Shallow copy of chipData reference
        clonedNode.chipId = this.chipId;
        clonedNode.parentChip = this.parentChip; // Shallow copy, might need context adjustment

        clonedNode.numInputsReceived = 0;
        clonedNode.inputValues = new Map();

        clonedNode.ports.inputs = []; 
        clonedNode.ports.outputs = [];

        this.ports.inputs.forEach(originalPort => {
            const clonedPort = originalPort.clone(clonedNode, this.chipBelongsTo);
            clonedNode.ports.inputs.push(clonedPort);
        });
        this.ports.outputs.forEach(originalPort => {
            const clonedPort = originalPort.clone(clonedNode, this.chipBelongsTo);
            clonedNode.ports.outputs.push(clonedPort);
        });
        
        
        return clonedNode;
    }
}

class OrNode extends Node {
    constructor(chip) {
        super(null, chip, "OR");
        this.addPort("input", "A");
        this.addPort("input", "B");
        this.addPort("output", "A || B");
    }

    run() {
        let result = false;

        if(this.ports.inputs[0].state === PinState.HIGH || this.ports.inputs[1].state === PinState.HIGH) {
            result = true;
        }
        console.log("OR NODE RUN", result);
        this.ports.outputs[0].receiveInput(result ? PinState.HIGH : PinState.LOW);
    }

    clone() {
        
        let clonedNode = new OrNode(this.chipBelongsTo);
        
        clonedNode.position = new Vector2(this.position.x, this.position.y);
        clonedNode.chipData = this.chipData; // Shallow copy of chipData reference
        clonedNode.chipId = this.chipId;
        clonedNode.parentChip = this.parentChip; // Shallow copy, might need context adjustment

        clonedNode.numInputsReceived = 0;
        clonedNode.inputValues = new Map();

        clonedNode.ports.inputs = []; 
        clonedNode.ports.outputs = [];

        this.ports.inputs.forEach(originalPort => {
            const clonedPort = originalPort.clone(clonedNode, this.chipBelongsTo);
            clonedNode.ports.inputs.push(clonedPort);
        });
        this.ports.outputs.forEach(originalPort => {
            const clonedPort = originalPort.clone(clonedNode, this.chipBelongsTo);
            clonedNode.ports.outputs.push(clonedPort);
        });
        
        
        return clonedNode;
    }
}

class NotNode extends Node {
    constructor(chip) {
        super(null, chip, "NOT");
        this.addPort("input", "A");
        this.addPort("output", "!A");
    }

    run() {
        this.ports.outputs[0].receiveInput(this.ports.inputs[0].state === PinState.HIGH ? PinState.LOW : PinState.HIGH);
    }

    clone() {
        
        let clonedNode = new NotNode(this.chipBelongsTo);
        
        clonedNode.position = new Vector2(this.position.x, this.position.y);
        clonedNode.chipData = this.chipData; // Shallow copy of chipData reference
        clonedNode.chipId = this.chipId;
        clonedNode.parentChip = this.parentChip; // Shallow copy, might need context adjustment

        clonedNode.numInputsReceived = 0;
        clonedNode.inputValues = new Map();

        clonedNode.ports.inputs = []; 
        clonedNode.ports.outputs = [];


        this.ports.inputs.forEach(originalPort => {
            const clonedPort = originalPort.clone(clonedNode, this.chipBelongsTo);
            clonedNode.ports.inputs.push(clonedPort);
        });
        this.ports.outputs.forEach(originalPort => {
            const clonedPort = originalPort.clone(clonedNode, this.chipBelongsTo);
            clonedNode.ports.outputs.push(clonedPort);
        });
        
        
        return clonedNode;
    }
}

class NandNode extends Node {
    constructor() {
        super(null, chip, "NAND");

        this.addPort("input", "A");
        this.addPort("input", "B");
        this.addPort("output", "!(A&B)");
    }

    run() {
        if(!(this.ports.inputs[0].state && this.ports.inputs[1].state)){
            console.log("ok");
        }
    }

    clone() {
        
        let clonedNode = new NandNode(this.chipBelongsTo);
        
        clonedNode.position = new Vector2(this.position.x, this.position.y);
        clonedNode.chipData = this.chipData; // Shallow copy of chipData reference
        clonedNode.chipId = this.chipId;
        clonedNode.parentChip = this.parentChip; // Shallow copy, might need context adjustment

        clonedNode.numInputsReceived = 0;
        clonedNode.inputValues = new Map();

        clonedNode.ports.inputs = []; 
        clonedNode.ports.outputs = [];

        this.ports.inputs.forEach(originalPort => {
            const clonedPort = originalPort.clone(clonedNode, this.chipBelongsTo);
            clonedNode.ports.inputs.push(clonedPort);
        });
        this.ports.outputs.forEach(originalPort => {
            const clonedPort = originalPort.clone(clonedNode, this.chipBelongsTo);
            clonedNode.ports.outputs.push(clonedPort);
        });
        
        
        return clonedNode;
    }
}

class LLMNode extends Node {
    constructor(chip) {
        super(null, chip, "LLM");
        this.baseHeight = 60;
        this.provider = null;
        this.model = null;
    }

    run() {
        if(this.ports.inputs.length <= 0 || this.ports.outputs.length <= 0) {
            console.error("Set input and outputs in LLM node.")
            return;
        }

        if(!this.provider || !this.model) {
            console.error("Set provider and model in LLM node.")
            return;
        }
    }

    

    draw(ctx) {
        super.draw(ctx);

        ctx.save();
        ctx.font = '14px Arial';  
        ctx.fillStyle = 'white';  
        ctx.textAlign = 'left';
        ctx.fillText("Provider: " + this.provider, this.position.x, this.position.y - 22);
        ctx.fillText("Model: " + this.model, this.position.x, this.position.y - 5);
        ctx.restore();
    }

    clone() {
        
        let clonedNode = new LLMNode(this.chipBelongsTo);
        
        clonedNode.position = new Vector2(this.position.x, this.position.y);
        clonedNode.chipData = this.chipData; // Shallow copy of chipData reference
        clonedNode.chipId = this.chipId;
        clonedNode.parentChip = this.parentChip; // Shallow copy, might need context adjustment

        clonedNode.numInputsReceived = 0;
        clonedNode.inputValues = new Map();

        clonedNode.provider = this.provider || null;
        clonedNode.model = this.model || null;

        clonedNode.ports.inputs = []; 
        clonedNode.ports.outputs = [];

        this.ports.inputs.forEach(originalPort => {
            const clonedPort = originalPort.clone(clonedNode, this.chipBelongsTo);
            clonedNode.ports.inputs.push(clonedPort);
        });
        this.ports.outputs.forEach(originalPort => {
            const clonedPort = originalPort.clone(clonedNode, this.chipBelongsTo);
            clonedNode.ports.outputs.push(clonedPort);
        });
        
        
        return clonedNode;
    }

}

class WebSocketNode extends Node {
    constructor(chip) {
        super(null, chip, "WebSocket");
        this.baseHeight = 60;
        this.socket = null;
        this.waiting = false;
        this.message = "test";
    }

    run() {
       
    }

    draw(ctx) {
        super.draw(ctx);



        ctx.save();
        ctx.font = '14px Arial';  
        ctx.fillStyle = 'white';  
        ctx.textAlign = 'left';
        ctx.fillText("Connected: " + (this.socket ? "true":"false"), this.position.x, this.position.y - 22);
        ctx.fillText("Waiting: " + this.waiting, this.position.x, this.position.y - 4);
        ctx.restore();
    }

    clone() {
        
        let clonedNode = new WebSocketNode(this.chipBelongsTo);
        
        clonedNode.position = new Vector2(this.position.x, this.position.y);
        clonedNode.chipData = this.chipData; // Shallow copy of chipData reference
        clonedNode.chipId = this.chipId;
        clonedNode.parentChip = this.parentChip; // Shallow copy, might need context adjustment

        clonedNode.numInputsReceived = 0;
        clonedNode.inputValues = new Map();

        clonedNode.socket = this.socket || null;
        clonedNode.waiting = this.waiting;
        clonedNode.message = this.message;

        clonedNode.ports.inputs = []; 
        clonedNode.ports.outputs = [];

        this.ports.inputs.forEach(originalPort => {
            const clonedPort = originalPort.clone(clonedNode, this.chipBelongsTo);
            clonedNode.ports.inputs.push(clonedPort);
        });
        this.ports.outputs.forEach(originalPort => {
            const clonedPort = originalPort.clone(clonedNode, this.chipBelongsTo);
            clonedNode.ports.outputs.push(clonedPort);
        });
        
        
        return clonedNode;
    }

}

class ChipNode extends Node {
    constructor(id, chipBelongsTo, _chipData) {

        super(null, chipBelongsTo, _chipData.name);
        this.chipData = _chipData;

        this.chipData.nodes.forEach(n => {
            if(n instanceof ChipIONode) {
                if(n.type === "input") {

                    const port = this.addPort("input", n.ports.outputs[0].name);
                    port.antiPort = n.ports.outputs[0];
                }
                else if(n.type === "output") {
                    const port = this.addPort("output", n.ports.inputs[0].name);
                    port.antiPort = n.ports.inputs[0];

                    n.ports.inputs[0].antiPort = port;
                }
            }
        });


    }

    addAntiPort(n){
        if(n.type === "input") {
            const port = this.addPort("input", "Untitled");
            port.antiPort = n.ports.outputs[0];
        }
        else {
            const port = this.addPort("output", "Untitled");
            port.antiPort = n.ports.inputs[0];
        }
    }

    run() {

    }

    draw(ctx) {
        super.draw(ctx); // Draw as a standard node box with name and ports
    }

    clone() {
        
        let clonedNode = new ChipNode(null, this.chipBelongsTo, this.chipData);
        
        clonedNode.position = new Vector2(this.position.x, this.position.y);
        clonedNode.chipData = this.chipData; // Shallow copy of chipData reference
        clonedNode.chipId = this.chipId;
        clonedNode.parentChip = this.parentChip; // Shallow copy, might need context adjustment

        clonedNode.numInputsReceived = 0;
        clonedNode.inputValues = new Map();

        clonedNode.ports.inputs = []; 
        clonedNode.ports.outputs = [];

        this.ports.inputs.forEach(originalPort => {
            const clonedPort = originalPort.clone(clonedNode, this.chipBelongsTo);
            clonedNode.ports.inputs.push(clonedPort);
        });
        this.ports.outputs.forEach(originalPort => {
            const clonedPort = originalPort.clone(clonedNode, this.chipBelongsTo);
            clonedNode.ports.outputs.push(clonedPort);
        });
        
        
        return clonedNode;
    }
}

class Chip {
    constructor(id, name) {
        this.id = id || generateUUID();
        this.nodes = [];
        this.connections = [];
        this.name = name || "Untitled";
        this.nodes.push(new ChipIONode(this, "input"));
        this.nodes.push(new ChipIONode(this, "input"));
        this.nodes.push(new ChipIONode(this, "input"));
        this.nodes.push(new ChipIONode(this, "output"));
        this.nodes.push(new AndNode(this));
        this.nodes.push(new AndNode(this));
        this.nodes.push(new OrNode(this));
        this.nodes.push(new NotNode(this));
        this.nodes.push(new NotNode(this));
        this.nodes.push(new LLMNode(this));
    }

    clone() {
        
    }


    addNode(node) {
        this.nodes.push(node);
    }

    removeNode(nodeId) {
        this.nodes = this.nodes.filter(node => node.id !== nodeId);
        this.connections = this.connections.filter(connection => 
            connection.port1.node.id !== nodeId && connection.port2.node.id !== nodeId
        );
    }

    addConnection(connection) {
        //this.connections.unshift(connection);
        this.connections.push(connection);
    }

    serialize() {
        return {
            id: this.id,
            name: this.name,
            nodes: this.nodes.map(node => node.serialize()),
            connections: this.connections.map(connection => connection.serialize())
        };
    }

    static deserialize(data) {
        const chip = new Chip(data.id);

        data.nodes.forEach(nodeData => {
            const node = Node.deserialize(nodeData);
            chip.addNode(node);
        });

        data.connections.forEach(connectionData => {
            const connection = Connection.deserialize(connectionData, chip.nodes.flatMap(node => node.ports));
            chip.addConnection(connection);
        });

        return chip;
    }

    getAllPortsMap() {
        const allPorts = new Map();
        this.nodes.forEach(node => {
            node.getAllPorts().forEach(port => {
                allPorts.set(port.id, port);
            });
        });
        // Include ports from bus connections that might not be on nodes
        this.connections.forEach(conn => {
            if (conn.port1 && conn.port1.isBusPort && !allPorts.has(conn.port1.id)) {
                allPorts.set(conn.port1.id, conn.port1);
            }
            if (conn.port2 && conn.port2.isBusPort && !allPorts.has(conn.port2.id)) {
                allPorts.set(conn.port2.id, conn.port2);
            }
        });
        return allPorts;
    }

    clone() {
        const clonedChip = new Chip(null, this.name + " Clone"); // New ID, modified name
        clonedChip.nodes = []; // Clear any default nodes from Chip constructor

        const portIdMap = new Map(); // Map<originalPortId, clonedPortInstance>
        const originalNodeToClonedNodeMap = new Map(); // Map<originalNodeInstance, clonedNodeInstance>

        // 1. Clone Nodes and their Ports
        this.nodes.forEach(originalNode => {
            // Node.clone should handle creating the correct type if overridden in subclasses
            const clonedNode = originalNode.clone();
            clonedChip.addNode(clonedNode); // addNode sets chipBelongsTo
            originalNodeToClonedNodeMap.set(originalNode, clonedNode);

            clonedNode.ports.inputs = []; 
            clonedNode.ports.outputs = [];

            originalNode.ports.inputs.forEach(originalPort => {
                const clonedPort = originalPort.clone(clonedNode, clonedChip);
                portIdMap.set(originalPort.id, clonedPort);
                clonedNode.ports.inputs.push(clonedPort);
            });
            originalNode.ports.outputs.forEach(originalPort => {
                const clonedPort = originalPort.clone(clonedNode, clonedChip);
                portIdMap.set(originalPort.id, clonedPort);
                clonedNode.ports.outputs.push(clonedPort);
            });
        });

        // 2. Clone Connections
        this.connections.forEach(originalConnection => {
            const clonedConnection = originalConnection.clone(clonedChip, portIdMap);
            clonedChip.addConnection(clonedConnection); // addConnection handles port notifications and sets chipBelongsTo
        });
        
        // 3. Relink AntiPorts within the cloned chip
        /*clonedChip.nodes.forEach(clonedNode => {
            clonedNode.getAllPorts().forEach(clonedPort => {
                if (clonedPort._originalAntiPortId) { // _originalAntiPortId is a temporary prop set during Port.clone
                    const clonedAntiPort = portIdMap.get(clonedPort._originalAntiPortId);
                    if (clonedAntiPort) {
                        clonedPort.antiPort = clonedAntiPort;
                    }
                    delete clonedPort._originalAntiPortId; // Clean up temporary property
                }
            });
        });*/

        return clonedChip;
    }
}