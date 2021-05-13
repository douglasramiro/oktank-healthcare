// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
// UNCOMMENT THE FOLLOWING
const sdk = require('amazon-chime-sdk-js');
const url_without_slash = window.location.href.replace(/\/doctors\/?$/,
    '');
const appointments_endpoint = `${url_without_slash}/appointments`;
const appointment_endpoint = `${url_without_slash}/appointment`;
var appointments, currentappointment, observer, session;
window.addEventListener('load', async () => {
    refreshQueue();
    window.setInterval(async () => {
        refreshQueue();
    }, 5000);
    domElement('telehealth-join-next').addEventListener('click', async () => {
        await stopCurrentCall();
        if (appointments.length === 0) {
            domElement('telehealth-speaking-with').innerHTML = 'You are not speaking with anyone right now.';
            return;
        }
        const fetchResult = await window.fetch(
            window.encodeURI(`${appointment_endpoint}?AppointmentId=${appointments[0].AppointmentId}`),
            {method: 'GET'},
        );
        currentappointment = await fetchResult.json();
        if (currentappointment.Error) {
            domElement('telehealth-speaking-with').innerText = `${appointments[0].PatientName} hung up already.`;
            refreshQueue();
            return;
        }
        domElement('telehealth-speaking-with').innerText = `Connecting to ${currentappointment.PatientName}...`;
        console.log(`Current appointment: ${JSON.stringify(currentappointment, '',
            2)}`);
        const logger = new sdk.ConsoleLogger('SDK', sdk.LogLevel.INFO);
        session = new sdk.DefaultMeetingSession(
            new sdk.MeetingSessionConfiguration(
                currentappointment.Meeting,
                currentappointment.DoctorAttendee,
            ),
            logger,
            new sdk.DefaultDeviceController(logger),
        );
        session.audioVideo.addObserver(observer);
        const firstAudioDeviceId = (await session.audioVideo.listAudioInputDevices())[0].deviceId;
        await session.audioVideo.chooseAudioInputDevice(firstAudioDeviceId);
        const firstVideoDeviceId = (await session.audioVideo.listVideoInputDevices())[0].deviceId;
        await session.audioVideo.chooseVideoInputDevice(firstVideoDeviceId);
        session.audioVideo.bindAudioElement(domElement('telehealth-audio'));
        session.audioVideo.start();
    });
    
    document.getElementById('videodevice').addEventListener('change', async() => {
    const deviceId = document.getElementById('videodevice').value;
    console.log("Selecting video ",deviceId);
    await session.audioVideo.chooseVideoInputDevice(deviceId);
    })
  
     document.getElementById('micdevice').addEventListener('change', async() => {
        const deviceId = document.getElementById('micdevice').value;
        console.log("Selecting mic ",deviceId);
        await session.audioVideo.chooseAudioInputDevice(deviceId)
      })
  
  document.getElementById('outdevice').addEventListener('change', async() => {
    const deviceId = document.getElementById('outdevice').value;
    console.log("Selecting out ",deviceId);
    await session.audioVideo.chooseAudioOutputDevice(deviceId)
  })
});

async function stopCurrentCall() {
    if (!session) {
        return;
    }
    session.audioVideo.stop();
    await window.fetch(
        window.encodeURI(`${appointment_endpoint}?AppointmentId=${currentappointment.AppointmentId}`), {method: 'DELETE'},);
    currentappointment = null;
    session = null;
    refreshQueue();
}

async function refreshQueue() {
    const fetchResult = await window.fetch(
        appointments_endpoint,
        {method: 'GET'},
    );
    const appointmentsResponse = await fetchResult.json();
    console.log("Appointments: ",appointmentsResponse);
    const queue = domElement('telehealth-queue');
    queue.innerHTML = '';
    const activelyWaitingappointments = []
    for (const appointment of appointmentsResponse) {
        if (currentappointment && appointment.AppointmentId === currentappointment.AppointmentId) {
            continue;
        }
        activelyWaitingappointments.push(appointment);
        const waitTimeTotal = Math.floor((Date.now() -
            Date.parse(appointment.CreatedOnDate)) / 1000);
        const waitTimeMinutes = Math.floor(waitTimeTotal / 60);
        const waitTimeSeconds = waitTimeTotal - waitTimeMinutes * 60;
        const waitTime = `${waitTimeMinutes} min ${waitTimeSeconds} sec`;
        queue.innerHTML += `<div>${appointment.PatientName} is feeling ${appointment.Feeling} out of 10 (waiting ${waitTime})</div>`;
    }
    if (activelyWaitingappointments.length === 0) {
        queue.innerHTML = 'No one is waiting right now.';
    }
    appointments = activelyWaitingappointments;
}

function updateVideoDevices(){
  var select = document.getElementById('videodevice');
    var length = select.options.length;
    for (var i = length-1; i >= 0; i--) {
      select.options[i] = null;
    }
    session.audioVideo.listVideoInputDevices().then(devices => {
      console.log("**************** Devices: "+JSON.stringify(devices));
      devices.map(d => {
        console.log("Device: "+JSON.stringify(d))
        var anOption = document.createElement('option');
        anOption.value = d.deviceId;
        anOption.innerHTML = d.label
        select.appendChild(anOption);
        select.style = 'display: block'
      })
    }, error => {
      console.log("Error to list video devices", error)
    });
}

function updateMicDevices(){
  var select = document.getElementById('micdevice');
    var length = select.options.length;
    for (var i = length-1; i >= 0; i--) {
      select.options[i] = null;
    }
    session.audioVideo.listAudioInputDevices().then(devices => {
      console.log("**************** Devices: "+JSON.stringify(devices));
      devices.map(d => {
        console.log("Device: "+JSON.stringify(d))
        var anOption = document.createElement('option');
        anOption.value = d.deviceId;
        anOption.innerHTML = d.label
        select.appendChild(anOption);
        select.style = 'display: block'
      })
    }, error => {
      console.log("Error to list mic devices", error)
    });
}

function updateOutputDevices(){
  var select = document.getElementById('outdevice');
    var length = select.options.length;
    for (var i = length-1; i >= 0; i--) {
      select.options[i] = null;
    }
    session.audioVideo.listAudioOutputDevices().then(devices => {
      console.log("**************** Devices: "+JSON.stringify(devices));
      devices.map(d => {
        console.log("Device: "+JSON.stringify(d))
        var anOption = document.createElement('option');
        anOption.value = d.deviceId;
        anOption.innerHTML = d.label
        select.appendChild(anOption);
        select.style = 'display: block'
      })
    }, error => {
      console.log("Error to list output devices", error)
    });
    
    
}

observer = {
    audioVideoDidStart: () => {
        domElement('telehealth-speaking-with').innerText = `Speaking with ${currentappointment.PatientName} right now.  On a scale of 1-10 they current rate a ${currentappointment.Feeling}.`;
        updateVideoDevices();
        updateMicDevices();
        updateOutputDevices();
        session.audioVideo.startLocalVideoTile();
    },
    videoTileDidUpdate: tileState => {
        const videoElement = tileState.localTile ? 'telehealth-local-video' : 'telehealth-remote-video';
        session.audioVideo.bindVideoElement(tileState.tileId, domElement(videoElement));
        domShow(videoElement);
    }
};

function domElement(className) {
    return document.getElementsByClassName(className)[0];
}

function domShow(className) {
    const element = domElement(className);
    element.style.display = 'block';
    element.setAttribute('show', 'true');
}

function domHide(className) {
    const element = domElement(className);
    element.style.display = 'none';
    element.setAttribute('show', 'false');
}

function domToggle(className) {
    const element = domElement(className);
    if (element.getAttribute('show') === 'true') {
        domHide(className);
    } else {
        domShow(className);
    }
}
