import * as express from 'express';
import * as bodyParser from 'body-parser';
import * as Docker from 'dockerode'
import * as req from 'request'
import { Request, Response } from 'express';
import { filter } from "lodash"

const repo = "maxm007/theia"

const app = express();

app.use(bodyParser.json());

var docker = new Docker({ socketPath: '/var/run/docker.sock' });



app.get('/start/:tag/:userId', async (request, response) => {
    // response.contentType('html')

    let userId = request.params["userId"]
    let tag = request.params["tag"]


    let containers = await docker.listContainers({
        "all": true,
        "filters": {
            "name": [tag + "-" + userId]
        }
    })
    if (containers.length > 1) {
        response.send("ERROR: Found too many containers<br>");
    }
    else if (containers.length == 0) {
        let images = await docker.listImages()
        let repoTag = repo + ":" + tag
        let matches = images.filter(x => x.RepoTags.find(rt => rt == repoTag))
        if (matches.length == 0) {
            response.send("ERROR: Couldnt find image for " + repoTag);
        }
        else if (matches.length > 1) {
            response.send("ERROR: Multiple images for " + repoTag);
        }
        else {
            let image = matches[0]
            let x = await docker.run(
                image.Id,
                [],
                process.stdout,
                {
                    name: tag + "-" + userId,
                    "ExposedPorts": {
                        
                    }
                },
                function (err, data, container) {
                    console.log(data.StatusCode);
                });

        }
        response.send("")
    }
    else {
        let container = containers[0]
        if (container.State == "running") {
            let host = request.hostname
            let destination = host + ":" + container.Ports[0].PublicPort
            response.redirect("http://" + destination)
        }
        else {
            let newContainer = docker.getContainer(container.Id)
            await newContainer.start()
            waitOnStartedContainerAndRedirect(container.Id, request, response)
        }
        // response.write('<pre id="json">')
        // response.write(JSON.stringify(containers[0],undefined,2))
        // response.write('</pre>')
    }
});

async function waitOnStartedContainerAndRedirect(containerId: string, request: Request, response: Response) {

    let startedContainers = await docker.listContainers({
        filters: {
            id: [containerId],
            status: ["running"]
        }
    })


    let startedContainer = startedContainers[0]
    let host = request.hostname
    let destination = "http://" + host + ":" + startedContainer.Ports[0].PublicPort

    try {
        retry(10, 2000, destination);
    } catch {
        console.error("Couldn't connect to " + destination)
    }
    await later(1000)
    response.redirect(destination)
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
                } else {
                    return new Error('max retries reached');
                }
            }

            console.log('success');

        });
    }
})();

function later(delay) {
    return new Promise(function (resolve) {
        setTimeout(resolve, delay);
    });
}

app.listen(5000);