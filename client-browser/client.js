const WEBSOCKET_ADDRESS = "ws://stovoy.tech:9000";
const WEBRTC_ADDRESS = "http://stovoy.tech:8001/new_rtc_session";

function runBenchmark(connectionFunction, connectionCount, packetCount, packetInterval, done) {
    const benchmarkData = {connections: {}};
    let finishCount = 0;
    for (let i = 0; i < connectionCount; i++) {
        benchmarkData.connections[i] = {};
        connectionFunction(benchmarkData.connections[i], packetCount, packetInterval, function () {
            finishCount += 1;
            if (finishCount === connectionCount) {
                done(benchmarkData);
            }
        });
    }
}

function openWebsocketConnection(connectionData, packetCount, packetInterval, done) {
    const socket = new WebSocket(WEBSOCKET_ADDRESS);
    connectionData.packets = {};
    connectionData.opening = Date.now();
    socket.binaryType = 'arraybuffer';

    socket.onopen = function () {
        connectionData.opened = Date.now();

        sendPackets(socket, packetCount, packetInterval,
            function (packetId) {
                connectionData.packets[packetId] = {};
                connectionData.packets[packetId].sent = Date.now();
            },
        );
    };

    let recvCount = 0;

    let closeTimeout = setInterval(function () {
        if (recvCount === packetCount || Date.now() - connectionData.opened > 5000) {
            connectionData.closing = Date.now();
            clearInterval(closeTimeout);
            socket.close();
        }
    }, 50);

    socket.onmessage = function (evt) {
        let packetId = Number(evt.data);
        connectionData.packets[packetId].received = Date.now();
        connectionData.packets[packetId].latency = connectionData.packets[packetId].received - connectionData.packets[packetId].sent;
        recvCount += 1;
    };

    socket.onclose = function () {
        connectionData.closed = Date.now();
        done();
    }
}

function openWebRTCConnection(connectionData, packetCount, packetInterval, done) {
    connectionData.packets = {};

    let peer = new RTCPeerConnection({
        iceServers: [{
            urls: ["stun:stun.l.google.com:19302"]
        }]
    });
    let channel = peer.createDataChannel("webudp", {
        ordered: false,
        maxRetransmits: 0
    });
    channel.binaryType = "arraybuffer";

    let recvCount = 0;

    channel.onopen = function () {
        connectionData.opened = Date.now();

        sendPackets(channel, packetCount, packetInterval,
            function (packetId) {
                connectionData.packets[packetId] = {};
                connectionData.packets[packetId].sent = Date.now();
            },
        );

        let closeTimeout = setInterval(function () {
            if (recvCount === packetCount || Date.now() - connectionData.opened > 5000) {
                connectionData.closing = Date.now();
                clearInterval(closeTimeout);
                peer.close();
            }
        }, 50);

        channel.onmessage = function (evt) {
            let packetId = Number(evt.data);
            connectionData.packets[packetId].received = Date.now();
            connectionData.packets[packetId].latency = connectionData.packets[packetId].received - connectionData.packets[packetId].sent;
            recvCount += 1;
        };
    };

    channel.onclose = function () {
        connectionData.closed = Date.now();
        done();
    };

    channel.onerror = function (evt) {
        console.log("data channel error:", evt.message);
    };

    peer.onicecandidate = function (evt) {
    };

    peer.createOffer().then(function (offer) {
        return peer.setLocalDescription(offer);
    }).then(function () {
        let request = new XMLHttpRequest();
        connectionData.opening = Date.now();
        request.open("POST", WEBRTC_ADDRESS);
        request.onload = function () {
            if (request.status === 200) {
                let response = JSON.parse(request.responseText);
                peer.setRemoteDescription(new RTCSessionDescription(response.answer)).then(function () {
                    let candidate = new RTCIceCandidate(response.candidate);
                    peer.addIceCandidate(candidate).then(function () {
                    }).catch(function (err) {
                    });
                }).catch(function (e) {
                });
            }
        };
        request.send(peer.localDescription.sdp);
    }).catch(function (reason) {
    });
}

function sendPackets(connection, packetCount, packetInterval, onSend) {
    let packetId = 0;
    let cancel = setInterval(function () {
        if (packetId === packetCount) {
            clearInterval(cancel);
        } else {
            onSend(packetId);
            connection.send(packetId);
            packetId++;
        }
    }, packetInterval);
}

let connectionCount = 1;
let packetCount = 20;
let packetInterval = 50;

function printCsv(benchmarkResults) {
    let header = 'connectionId,openLatency,closeLatency,';
    for (let i = 0; i < packetCount; i++) {
        header += `packetLatency${i}`;
        if (i < packetCount - 1) {
            header += ',';
        }
    }
    console.log(header);
    for (let connectionId = 0; connectionId < connectionCount; connectionId++) {
        let connectionData = benchmarkResults.connections[connectionId];
        let openLatency = connectionData.opened - connectionData.opening;
        let closeLatency = connectionData.closed - connectionData.closing;
        let line = `${connectionId},${openLatency},${closeLatency},`;
        for (let packetId = 0; packetId < packetCount; packetId++) {
            let packetData = connectionData.packets[packetId];
            line += `${packetData.latency},`;
        }
        line = line.substring(0, line.length - 1);
        console.log(line);
    }
}

console.log("Running Websocket Benchmark");
runBenchmark(openWebsocketConnection, connectionCount, packetCount, packetInterval,
    function (websocketBenchmarkResults) {
        console.log(websocketBenchmarkResults);
        printCsv(websocketBenchmarkResults);
        console.log('Running WebRTC Benchmark');
        runBenchmark(openWebRTCConnection, connectionCount, packetCount, packetInterval,
            function (webRTCBenchmarkResults) {
                console.log(webRTCBenchmarkResults);
                printCsv(webRTCBenchmarkResults);
            }
        );
    }
);
