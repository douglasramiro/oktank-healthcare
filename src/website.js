// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// UNCOMMENT THE FOLLOWING

const sdk = require('amazon-chime-sdk-js');
const url_without_slash = window.location.href.replace(/\/$/, '');
const create_appointments_endpoint = `${url_without_slash}/appointments`;
var appointment, observer, session;

window.addEventListener('load', () => {
  domElement('telehealth-call').addEventListener('click', async () => {
    domHide('telehealth-customer-name');
    domHide('feelings');
    domHide('telehealth-call');
    domElement('telehealth-instructions').innerHTML = 'Connecting...';
    const fetchResult = await window.fetch(
      encodeURI(`${create_appointments_endpoint}?PatientName=${domElement('telehealth-customer-name').value}&Feeling=${domElement('feeling').value}`),
      { method: 'POST' },
    );
    const appointment = await fetchResult.json();
    console.log(`Created appointment: ${JSON.stringify(appointment, '', 2)}`);

    const logger = new sdk.ConsoleLogger('SDK', sdk.LogLevel.INFO);
    session = new sdk.DefaultMeetingSession(
      new sdk.MeetingSessionConfiguration(
        appointment.Meeting,
        appointment.PatientAttendee,
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
});

observer = {
  audioVideoDidStart: () => {
    domElement('telehealth-instructions').innerHTML = 'Connected...Please hold for the next staff member.';
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