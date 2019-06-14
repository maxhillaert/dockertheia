"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const bodyParser = require("body-parser");
const Docker = require("dockerode");
const req = require("request");
const repo = "maxm007/theia";
const containerPort = 3000;
const hostPort = 0;
const app = express();
app.use(bodyParser.json());
var docker = new Docker({ socketPath: '/var/run/docker.sock' });
app.get('/start/:tag/:userId', (request, response) => __awaiter(this, void 0, void 0, function* () {
    // response.contentType('html')
    let userId = request.params["userId"];
    let tag = request.params["tag"];
    let containers = yield findRunningContainers(tag, userId);
    if (containers.length > 1) {
        response.send("ERROR: Found too many containers<br>");
    }
    else if (containers.length == 0) {
        yield startImage(response, request, tag, userId);
    }
    else {
        let container = containers[0];
        if (container.State == "running") {
            let host = request.hostname;
            let destination = host + ":" + container.Ports[0].PublicPort;
            response.redirect("http://" + destination);
        }
        else {
            let newContainer = docker.getContainer(container.Id);
            yield newContainer.start();
            waitOnStartedContainerAndRedirect(container.Id, request, response);
        }
        // response.write('<pre id="json">')
        // response.write(JSON.stringify(containers[0],undefined,2))
        // response.write('</pre>')
    }
}));
function startImage(response, request, tag, userId) {
    return __awaiter(this, void 0, void 0, function* () {
        let images = yield docker.listImages();
        let repoTag = repo + ":" + tag;
        let matches = images.filter(x => x.RepoTags.find(rt => rt == repoTag));
        if (matches.length == 0) {
            response.send("ERROR: Couldnt find image for " + repoTag);
        }
        else if (matches.length > 1) {
            response.send("ERROR: Multiple images for " + repoTag);
        }
        else {
            let image = matches[0];
            let mapContainer = containerPort + "/tcp";
            let createSettings = {
                name: tag + "-" + userId,
                "ExposedPorts": {
                    [mapContainer]: {}
                },
                "PortBindings": {
                    [mapContainer]: [{
                            "HostPort": hostPort.toString()
                        }]
                },
            };
            let id = yield run(image, createSettings);
            if (id == undefined) {
                response.send("Error: could nor started container ID");
            }
            else {
                waitOnStartedContainerAndRedirect(id, request, response);
            }
        }
    });
}
function run(image, createSettings) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise(resolve => {
            let event = docker.run(image.Id, [], process.stdout, createSettings, {}, x => {
                console.info("Running container issue" + JSON.stringify(x));
            });
            event.on("start", x => {
                console.info("Start " + JSON.stringify(x));
                resolve(x.id);
            });
            event.on("data", x => {
                console.info("Data " + JSON.stringify(x));
                resolve(undefined);
            });
            event.on("end", x => {
                console.info("End " + JSON.stringify(x));
                resolve(undefined);
            });
        });
    });
}
function findRunningContainers(tag, userId) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield docker.listContainers({
            "all": true,
            "filters": {
                "name": [tag + "-" + userId]
            }
        });
    });
}
function waitOnStartedContainerAndRedirect(containerId, request, response) {
    return __awaiter(this, void 0, void 0, function* () {
        let startedContainers = yield docker.listContainers({
            filters: {
                id: [containerId],
                status: ["running"]
            }
        });
        let startedContainer = startedContainers[0];
        let host = request.hostname;
        let destination = "http://" + host + ":" + startedContainer.Ports[0].PublicPort;
        try {
            retry(10, 2000, destination);
        }
        catch (_a) {
            console.error("Couldn't connect to " + destination);
        }
        yield later(1000);
        response.redirect(destination);
    });
}
let retry = (function () {
    let count = 0;
    return function (max, timeout, url) {
        req(url, function (error, response, body) {
            if (error || response.statusCode !== 200) {
                console.log('fail to connect attempt ' + count + ' to ' + url);
                if (count++ < max) {
                    return setTimeout(function () {
                        retry(max, timeout, url);
                    }, timeout);
                }
                else {
                    return new Error('max retries reached');
                }
            }
            console.log('success');
        });
    };
})();
function later(delay) {
    return new Promise(function (resolve) {
        setTimeout(resolve, delay);
    });
}
app.listen(5000);
//# sourceMappingURL=index.js.map