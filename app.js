require("dotenv").config();
const AWS = require('aws-sdk');

AWS.config.update({
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
    region: "your aws region"
});

const s3 = new AWS.S3();

const url = s3.getSignedUrl('getObject', {
    Bucket: process.env.BUCKET_NAME,
    Key: "example/exaple.png",
    Expires: 999 // (seconds)
});

console.log(url);