const solace = require('solclientjs').debug; // logging supported
const mq = require('ibmmq');


// IBM MQ Configuration
const MQC = mq.MQC; // Import the MQ constants

const queueManager = 'Conn'; // Your Queue Manager name
const queueName = 'OUT.QUEUE'; // Your IBM MQ queue name
const channel = 'MY.SVRCONN'; // Your IBM MQ channel name
const host = 'localhost'; // Your IBM MQ host
const port = '1417'; // Your IBM MQ port
const mqUser = 'mqadmin'; // Your IBM MQ user
const mqPassword = 'Password123'; // Password if needed

// Set up MQ connection options
const cno = new mq.MQCNO();
cno.Options = MQC.MQCNO_NONE;

// MQ Queue connection options
const csp = new mq.MQCSP();
csp.UserId = mqUser;
csp.Password = mqPassword;
cno.SecurityParms = csp;

const cd = new mq.MQCD();
cd.ChannelName = channel;
cd.ConnectionName = `${host}(${port})`; // Ensure this is correct
cno.ClientConn = cd;

// Function to store messages into IBM MQ
function storeMessageToMQ(messageText) {
    mq.Connx(queueManager, cno, function (err, conn) {
        if (err) {
            console.error("Error connecting to MQ: ", err);
            return;
        }
        console.log("Connected to MQ");

        const od = new mq.MQOD();
        od.ObjectName = queueName;
        od.ObjectType = MQC.MQOT_Q;

        mq.Open(conn, od, MQC.MQOO_OUTPUT, function (err, hObj) {
            if (err) {
                console.error("Error opening MQ queue: ", err);
                mq.Disc(conn, function () {});
                return;
            }

            const mqMessage = new mq.MQMD();
            mqMessage.Format = MQC.MQFMT_STRING;
            mqMessage.Encoding = MQC.MQENC_NATIVE;
            mqMessage.Priority = 0;

            const pmo = new mq.MQPMO();
            pmo.Options = MQC.MQPMO_NO_SYNCPOINT;

            const messageBuffer = Buffer.isBuffer(messageText) 
                ? messageText 
                : Buffer.from(JSON.stringify(messageText));

            mq.Put(hObj, mqMessage, pmo, messageBuffer, function (err) {
                if (err) {
                    console.error("Error putting message to MQ: ", err);
                } else {
                    console.log("Message stored in MQ successfully");
                }
                mq.Close(hObj, 0, function (err) {
                    if (err) {
                        console.error("Error closing MQ queue: ", err);
                    }
                    mq.Disc(conn, function (err) {
                        if (err) {
                            console.error("Error disconnecting from MQ: ", err);
                        }
                    });
                });
            });
        });
    });
}

// Initialize Solace client
solace.SolclientFactory.init({});

// Subscriber function
function TopicSubscriber(solaceModule, topicName) {
    const subscriber = {};
    subscriber.session = null;
    subscriber.topicName = topicName;

    // Logger
    subscriber.log = function (line) {
        const now = new Date();
        const time = [('0' + now.getHours()).slice(-2), ('0' + now.getMinutes()).slice(-2),
            ('0' + now.getSeconds()).slice(-2)];
        const timestamp = '[' + time.join(':') + '] ';
        console.log(timestamp + line);
    };

    subscriber.log(`\n*** Subscriber to topic "${subscriber.topicName}" is ready to connect ***`);

    // Main function
    subscriber.run = function () {
        subscriber.connect();
    };

    // Establishes connection to Solace PubSub+ Event Broker
    subscriber.connect = function () {
        if (subscriber.session !== null) {
            subscriber.log('Already connected and ready to subscribe.');
            return;
        }

        // Solace connection details
        const hostUrl = 'wss://mr-connection-d2212zc110i.messaging.solace.cloud:443';
        const vpnName = 'my-first-service';
        const username = 'solace-cloud-client';
        const pass = '6vk505gohppejcup9b93j69oa6';

        subscriber.log('Connecting to Solace PubSub+ Event Broker using url: ' + hostUrl);
        subscriber.log('Client username: ' + username);
        subscriber.log('Solace PubSub+ Event Broker VPN name: ' + vpnName);

        try {
            subscriber.session = solace.SolclientFactory.createSession({
                url: hostUrl,
                vpnName: vpnName,
                userName: username,
                password: pass,
            });
        } catch (error) {
            subscriber.log(error.toString());
            return; // Exit if session creation fails
        }

        subscriber.session.on(solace.SessionEventCode.UP_NOTICE, function () {
            subscriber.log('=== Successfully connected and ready to subscribe. ===');
            subscriber.subscribe();
        });

        subscriber.session.on(solace.SessionEventCode.MESSAGE, function (message) {
            const messageText = message.getBinaryAttachment();
            subscriber.log('Received message: "' + messageText + '"');
            storeMessageToMQ(messageText); // Store the message in MQ
        });

        try {
            subscriber.session.connect();
        } catch (error) {
            subscriber.log(error.toString());
        }
    };

    subscriber.subscribe = function () {
        if (subscriber.session !== null) {
            subscriber.log('Subscribing to topic: ' + subscriber.topicName);
            try {
                subscriber.session.subscribe(
                    solace.SolclientFactory.createTopicDestination(subscriber.topicName),
                    true,
                    subscriber.topicName,
                    10000
                );
            } catch (error) {
                subscriber.log(error.toString());
            }
        } else {
            subscriber.log('Cannot subscribe because not connected to Solace PubSub+ Event Broker.');
        }
    };

    return subscriber;
}

// Create the subscriber and run it
const subscriber = new TopicSubscriber(solace, 'flight/boarding/fl1234/yow/ewr');
subscriber.run();