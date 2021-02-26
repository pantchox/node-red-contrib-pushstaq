module.exports = function (RED) {
    const https = require('https');
    // const PUSHSTAQ_API_URL = 'https://www.pushstaq.com/api/push/';

    // function to send the payload to PushStaq
    function callPushStaqApi(node, msg, done) {
        // create valid PushStaq API message
        const data = JSON.stringify({
            message: msg.payload,
        });

        // use node native https lib
        const req = https
            .request(
                {
                    host: 'www.pushstaq.com',
                    port: '443',
                    path: '/api/push/',
                    method: 'POST',
                    headers: {
                        'x-api-key': node.config.apikey,
                        'Content-Type': 'application/json',
                        'Content-Length': data.length,
                    },
                },
                function (res) {
                    let resData = '';

                    res.on('data', function (chunk) {
                        resData += chunk;
                    });

                    res.on('end', function () {
                        let body = {};
                        try {
                            body = JSON.parse(resData);
                        } catch (e) {
                            // could not parse json, valid response is JSON means we have an error
                            body = {error: resData};
                        }
                        if (res.statusCode === 201) {
                            // No need for success to show any interaction in Node-Red
                            // node.warn('PushStaq request success: ' + (body.status ? body.status : body));
                            if (done) {
                                done();
                            }
                        } else {
                            const errorMessage = 'PushStaq request error: ' + body.error;
                            if (done) {
                                done(errorMessage);
                            } else {
                                node.error(errorMessage, msg);
                            }
                        }
                    });
                }
            )
            .on('error', function (err) {
                const errorMessage = 'PushStaq request unknown error: ' + err.toString();
                if (done) {
                    done(errorMessage);
                } else {
                    node.error(errorMessage, msg);
                }
            });

        req.write(data);
        req.end();
    }

    // main node code
    function PushStaqNode(n) {
        RED.nodes.createNode(this, n);
        const node = this;
        this.config = RED.nodes.getCredentials(n.config);
        if (!node.config || (node.config && !node.config.apikey)) {
            node.error('API Key is not defined, aborting.');
            return;
        }

        this.on('input', function (msg, send, done) {
            msg.payload = msg.payload || null;

            if (msg.payload) {
                callPushStaqApi(node, msg, done);
            } else {
                if (done) {
                    done('PushStaq node must receive msg.payload in order to work');
                } else {
                    node.error('PushStaq node must receive msg.payload in order to work', msg);
                }
            }
        });
    }

    // register node
    RED.nodes.registerType('PushStaq', PushStaqNode);

    // configuration node
    function PushStaqApiKeys(n) {
        RED.nodes.createNode(this, n);
        this.name = n.name;
        this.apikey = n.apikey;
    }

    // register configuration node
    RED.nodes.registerType('pushstaq-api-keys', PushStaqApiKeys, {
        credentials: {
            apikey: {type: 'text'},
        },
    });
};
