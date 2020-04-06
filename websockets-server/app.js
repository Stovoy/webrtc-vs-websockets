const fastify = require('fastify')();

fastify.register(require('fastify-ws'));

fastify.ready(err => {
    if (err) {
        throw err;
    }

    console.log('Server started.');

    fastify.ws
        .on('connection', socket => {
            console.log('Client connected.');

            socket.on('message', msg => socket.send(msg));

            socket.on('close', () => console.log('Client disconnected.'));
        })
});

fastify.listen(9000);
