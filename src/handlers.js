const AWS = require('aws-sdk');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const ddb = new AWS.DynamoDB();
const chime = new AWS.Chime({ region: 'us-east-1' });
chime.endpoint = new AWS.Endpoint('https://service.chime.aws.amazon.com/console');

exports.website = async (event, context, callback) => {
  return serveWebpage(callback, './website.html');
};

exports.doctors = async (event, context, callback) => {
  return serveWebpage(callback, './doctors.html');
};

exports.createAppointment = async (event, context, callback) => {
  if (!event.queryStringParameters || !event.queryStringParameters.PatientName || !event.queryStringParameters.Feeling) {
    return reply(callback, 400, {Error: 'Must provide PatientName and Feeling query parameter'});
  }

  const meeting = await chime.createMeeting({
    ClientRequestToken: uuidv4(),
    MediaRegion: 'us-east-1',
  }).promise();

  const meetingId = meeting.Meeting.MeetingId;

  const patientAttendee = await chime.createAttendee({
    MeetingId: meetingId,
    ExternalUserId: uuidv4(),
  }).promise();

  const doctorAttendee = await chime.createAttendee({
    MeetingId: meetingId,
    ExternalUserId: uuidv4(),
  }).promise();

  const AppointmentId = uuidv4();

  await ddb.putItem({
    Item: {
      'AppointmentId': { S: AppointmentId },
      'CreatedOnDate': {S: (new Date()).toISOString() },
      'Meeting': { S: JSON.stringify(meeting) },
      'MeetingId': { S: meetingId },
      'PatientName': { S: event.queryStringParameters.PatientName },
      'Feeling': { S: event.queryStringParameters.Feeling },
      'PatientAttendee': { S: JSON.stringify(patientAttendee) },
      'DoctorAttendee': { S: JSON.stringify(doctorAttendee) },
      'TTL': { N: `${Math.floor(Date.now() / 1000) + 86400}` },
    },
    TableName: process.env.MEDICALCARE_TABLE_NAME,
  }).promise();

  return reply(callback, 201, {
    AppointmentId: AppointmentId,
    Meeting: meeting,
    PatientAttendee: patientAttendee,
  });
};

exports.getAppointments = async (event, context, callback) => {
  return reply(callback, 200, (await ddb.scan({
    TableName: process.env.MEDICALCARE_TABLE_NAME,
  }).promise()).Items.sort((a, b) => {
    if (a.CreatedOnDate.S < b.CreatedOnDate.S) return -1;
    if (a.CreatedOnDate.S > b.CreatedOnDate.S) return 1;
    return 0;
  }).map(item => {
    return {
      AppointmentId: item.AppointmentId.S,
      CreatedOnDate: item.CreatedOnDate.S,
      PatientName: item.PatientName.S,
      Feeling: item.Feeling.S
    };
  }));
};

exports.getAppointment = async (event, context, callback) => {
  if (!event.queryStringParameters || !event.queryStringParameters.AppointmentId) {
    return reply(callback, 400, {Error: 'Must provide AppointmentId query parameter'});
  }

  const AppointmentId = event.queryStringParameters.AppointmentId;

  let item;
  try {
    result = await ddb.getItem({
      Key: { AppointmentId: { S: AppointmentId, }, },
      TableName: process.env.MEDICALCARE_TABLE_NAME,
    }).promise();
    item = result.Item;
    if (!item) {
      throw new Error('AppointmentId not found');
    }
  } catch (err) {
    return reply(callback, 404, {Error: `AppointmentId does not exist: ${AppointmentId}`});
  }

  const meetingId = item.MeetingId.S;
  try {
    await chime.getMeeting({
      MeetingId: meetingId
    }).promise();
  } catch (err) {
    await ddb.deleteItem({
      Key: { AppointmentId: { S: AppointmentId, }, },
      TableName: process.env.MEDICALCARE_TABLE_NAME,
    }).promise();
    return reply(callback, 404, {Error: `Meeting no longer exists for AppointmentId: ${AppointmentId}`});
  }

  return reply(callback, 200, {
    AppointmentId: item.AppointmentId.S,
    CreatedOnDate: item.CreatedOnDate.S,
    Meeting: JSON.parse(item.Meeting.S).Meeting,
    PatientName: item.PatientName.S,
    Feeling: item.Feeling.S,
    DoctorAttendee: JSON.parse(item.DoctorAttendee.S).Attendee,
  });
};

exports.deleteAppointment = async (event, context, callback) => {
  if (!event.queryStringParameters || !event.queryStringParameters.AppointmentId) {
    return reply(callback, 400, {Error: 'Must provide AppointmentId query parameter'});
  }

  const AppointmentId = event.queryStringParameters.AppointmentId;

  let item;
  try {
    result = await ddb.getItem({
      Key: { AppointmentId: { S: AppointmentId, }, },
      TableName: process.env.MEDICALCARE_TABLE_NAME,
    }).promise();
    item = result.Item;
    if (!item) {
      throw new Error('AppointmentId not found');
    }
  } catch (err) {
    return reply(callback, 404, {Error: `AppointmentId does not exist: ${AppointmentId}`});
  }

  const meetingId = item.MeetingId.S;
  await ddb.deleteItem({
    Key: { AppointmentId: { S: AppointmentId, }, },
    TableName: process.env.MEDICALCARE_TABLE_NAME,
  }).promise();

  await chime.deleteMeeting({
    MeetingId: meetingId,
  }).promise();

  return reply(callback, 200, {
    AppointmentId: AppointmentId,
  });
};

function reply(callback, statusCode, result) {
  callback(null, {
    statusCode: statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result, '', 2) + '\n',
    isBase64Encoded: false
  });
}

function serveWebpage(callback, page) {
  callback(null, {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: fs.readFileSync(page, { encoding: 'utf8' }),
    isBase64Encoded: false
  });
}
