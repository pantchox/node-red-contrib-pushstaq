module.exports = function (RED) {
    const crypto = require('crypto');
    const https = require('https');
    const E2EE_SIGNATURE = 'PS!';
    function generatePBKDFKey(passphrase, salt) {
        const key = crypto.pbkdf2Sync(passphrase, salt, 35000, 32, 'sha256');
        return key;
    }

    function encryptMessage(message, channelKey) {
        // initialization vector
        const iv = crypto.randomBytes(12);
        // aes-256-gcm
        const cipher = crypto.createCipheriv('aes-256-gcm', channelKey, iv);
        // encrypt message
        const encrypted = Buffer.concat([cipher.update(E2EE_SIGNATURE + message, 'utf8'), cipher.final()]);
        // get auth tag
        const tag = cipher.getAuthTag();
        // combine to base64
        return Buffer.concat([iv, encrypted, tag]).toString('base64');
    }

    // function to send the payload to PushStaq
    function callPushStaqApi(node, msg, done) {
        // create valid PushStaq API message
        let data = {
            message: msg.payload,
        };

        // end-to-end encryption configuration
        if (node.config.password && node.config.channelid) {
            const passphrase = node.config.password;
            const salt = node.config.channelid;
            const channelKey = generatePBKDFKey(passphrase, salt);
            const encryptedMessage = encryptMessage(msg.payload, channelKey);
            data.message = encryptedMessage;
            data.encrypted = true;
        }

        data = JSON.stringify(data);

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
            // PushStaq receives only strings, so for any input cast it
            msg.payload = String(msg.payload);

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
        this.password = n.password;
        this.channelid = n.channelid;
    }

    // register configuration node
    RED.nodes.registerType('pushstaq-api-keys', PushStaqApiKeys, {
        credentials: {
            apikey: {type: 'text'},
            password: {type: 'password'},
            channelid: {type: 'text'},
        },
    });
};
