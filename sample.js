var solace = require('solclientjs').debug; // logging supported
var mq = require('ibmmq');

// Initialize the Solace client library
solace.SolclientFactory.init();

var MQC = mq.MQC; // Import the MQ constants

// IBM MQ Configuration
var queueManager = 'Conn'; // Your Queue Manager name
var channel = 'MY.SVRCONN'; // Your IBM MQ channel name
var queueName = 'OUT.QUEUE'; // Your IBM MQ queue name
var host = 'localhost'; // Your IBM MQ host
var port = '1417'; // Your IBM MQ port
var mqUser = 'mqadmin'; // Your IBM MQ user (or leave blank)
var mqPassword = 'Password123'; // Password if needed

// Set up MQ connection options
var cno = new mq.MQCNO();
cno.Options = MQC.MQCNO_NONE;

// MQ Queue connection options
var csp = new mq.MQCSP();
csp.UserId = mqUser; // Replace with your MQ username
csp.Password = mqPassword; // Replace with your MQ password
cno.SecurityParms = csp;

var cd = new mq.MQCD();
cd.ChannelName = channel //'QM2.TO.SOL'; // Channel name
cd.ConnectionName =  `${host}(${port})`;//'localhost(1416)'; // Connection info
cno.ClientConn = cd;

// Function to store messages into IBM MQ
function storeMessageToMQ(messageText) {
    mq.Connx(queueManager, cno, function(err, conn) {
        if (err) {
            console.error("Error connecting to MQ: ", err);
        } else {
            console.log("Connected to MQ");

            var od = new mq.MQOD();
            od.ObjectName = queueName;
            od.ObjectType = MQC.MQOT_Q;

            mq.Open(conn, od, MQC.MQOO_OUTPUT, function(err, hObj) {
                if (err) {
                    console.error("Error opening MQ queue: ", err);
                } else {
                    var mqMessage = new mq.MQMD();
                    var pmo = new mq.MQPMO();
                    pmo.Options = MQC.MQPMO_NO_SYNCPOINT;

                    mq.Put(conn, hObj, mqMessage, pmo, messageText, function(err) {
                        if (err) {
                            console.error("Error putting message to MQ: ", err);
                        } else {
                            console.log("Message stored in MQ successfully");
                        }
                        mq.Close(hObj, 0, function(err) {
                            if (err) {
                                console.error("Error closing MQ queue: ", err);
                            }
                            mq.Disc(conn, function(err) {
                                if (err) {
                                    console.error("Error disconnecting from MQ: ", err);
                                }
                            });
                        });
                    });
                }
            });
        }
    });
}

// Subscriber function
var TopicSubscriber = function (solaceModule, topicName) {
    'use strict';
    var subscriber = {};
    subscriber.session = null;
    subscriber.topicName = topicName;
    subscriber.subscribed = false;

    // Logger
    subscriber.log = function (line) {
        var now = new Date();
        var time = [('0' + now.getHours()).slice(-2), ('0' + now.getMinutes()).slice(-2),
            ('0' + now.getSeconds()).slice(-2)];
        var timestamp = '[' + time.join(':') + '] ';
        console.log(timestamp + line);
    };

    subscriber.log('\n*** Subscriber to topic "' + subscriber.topicName + '" is ready to connect ***');

    // main function
    subscriber.run = function (argv) {
        subscriber.connect(argv);
    };

    // Establishes connection to Solace PubSub+ Event Broker
    subscriber.connect = function (argv) {
        if (subscriber.session !== null) {
            subscriber.log('Already connected and ready to subscribe.');
            return;
        }
        
        // Solace connection details
        var hostUrl = 'wss://mr-connection-d2212zc110i.messaging.solace.cloud:443'; // Your Solace Broker URL
        var vpnName = 'my-first-service'; // Your VPN name
        var username = 'solace-cloud-client'; // Replace with your Solace username
        var pass = '6vk505gohppejcup9b93j69oa6'; // Replace with your Solace password

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
        }

        subscriber.session.on(solace.SessionEventCode.UP_NOTICE, function (sessionEvent) {
            subscriber.log('=== Successfully connected and ready to subscribe. ===');
            subscriber.subscribe();

            // Attempt to connect to IBM MQ after Solace connection
            connectToMQ();
        });

        subscriber.session.on(solace.SessionEventCode.MESSAGE, function (message) {
            var messageText = message.getBinaryAttachment();
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
};

// Function to establish connection to IBM MQ and log message
function connectToMQ() {
    mq.Connx(queueManager, cno, function (err, conn) {
        if (err) {
            console.error('Error connecting to IBM MQ:', err);
        } else {
            console.log('Connected to IBM MQ successfully!');
            console.log('MQ connected to Solace successfully!!');
        }
    });
}

// Create the subscriber and run it
var subscriber = new TopicSubscriber(solace, 'flight/boarding/fl1234/yow/ewr');
subscriber.run(process.argv);
