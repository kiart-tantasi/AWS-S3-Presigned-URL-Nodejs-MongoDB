// 9 Things to set in .env file
// ACCESS_KEY_ID= find it in your AWS account
// SECRET_ACCESS_KEY= find it in your AWS account
// BUCKET_URL= for example: https://mybucket.s3.ap-southeast-1.amazonaws.com
// BUCKET_NAME= for example: items
// DB_URL= for example: mongodb://localhost:27017
// DB_NAME= for example: presignedUrlDB
// DB_COLLECTION= for example: presignedUrlCollection
// AWS_REGION= for example: ap-southeast-1
// TEST_OBJECT_URL= for example: https://mybucket.s3.ap-southeast-1.amazonaws.com/items/image.png

require("dotenv").config();
const { MongoClient } = require("mongodb");
const AWS = require("aws-sdk");

const transformImgUrl = async (objectUrl) => {
    const bucketUrl = process.env.BUCKET_URL; // for example: https://mybucket.s3.ap-southeast-1.amazonaws.com

    // เช็คว่าใช่ object url ของเราหรือไม่ ถ้าไม่ใช่ก็ return url อันเดิมกลับไปเลย
    if (!objectUrl.includes(bucketUrl)) {
        console.log("incorrect object url");
        return objectUrl;
    }

    const client = new MongoClient(process.env.DB_URL);
    try {
        // เชื่อมต่อ db และ collection (mongodb)
        await client.connect();
        const db = client.db(process.env.DB_NAME);
        const presignedUrlCollection = db.collection(process.env.DB_COLLECTION);

        const key = objectUrl.slice(bucketUrl.length + 1); // สไลซ์ Object Key ออกจาก object url
        const result = await presignedUrlCollection.findOne({ key: key }); // หาว่ามีลิงก์ที่สร้างไว้แล้วหรือไม่
        const deadline = (result) ? result.age - (5 * 60 * 1000) : null; // deadline = เวลาหมดอายุ - 5 นาที (หากมีลิงก์ที่สร้างไว้แล้ว)
        const now = new Date().getTime(); // เวลาปัจจุบัน

        // 1 ถ้าลิงก์ยังไม่หมดอายุ ใช้อันเดิมต่อได้ - return กลับได้เลย
        if (result && deadline && deadline > now) return result.url;
        
        // 2 ยังไม่มีลิงก์ที่สร้างไว้ใน mongodb หรือลิงก์หมดอายุแล้ว
        AWS.config.update({ // สร้างลิงก์ presigned url ใหม่ด้วย AWS SDK
            accessKeyId: process.env.ACCESS_KEY_ID, // AWS Access Key ID
            secretAccessKey: process.env.SECRET_ACCESS_KEY, // AWS Secret Access Key
            region: process.env.AWS_REGION,  // AWS Region
            signatureVersion: "v4"
        });
        const s3 = new AWS.S3();
        const seconds = 60 * 60;
        console.log("creating new presigned url...");
        const newPresignedUrl = s3.getSignedUrl('getObject', {
            Bucket: process.env.BUCKET_NAME, // ชื่อ bucket
            Key: key,
            Expires: seconds // อายุลิงก์ (วินาที)
        });
        const newPresignedUrlData = { // เตรียมข้อมูลที่จะส่งไปเก็บใน mongodb
            key: key,
            url: newPresignedUrl,
            age: new Date().getTime() + (seconds * 1000) //อายุลิงก์ (milli seconds)
        }

        // 1.1 ถ้าสร้างลิงก์ครั้งแรกก็ใช้ insertOne
        if (!result) await presignedUrlCollection.insertOne(newPresignedUrlData);
        // 1.2 ถ้าเคยมีแล้ว (แต่หมดอายุ) ก็ใช้คำสั่ง replaceOne เข้าไปแทนอันเก่า
        else if (result && deadline && deadline <= now) await presignedUrlCollection.replaceOne({ key: key }, newPresignedUrlData);
        // 1.3! ไม่ตรงซักเงื่อนไข throw เป็น Error ไปให้ try-catch
        else throw new Error("Something went wrong.");
        
        return newPresignedUrl; // return ลิงก์ presigned url อันใหม่
    } catch (error) {
        client.close();
        console.log(error.message);
        return objectUrl; // ถ้า error ก็ return url อันเดิมไปแทน
    }
}

// ทดสอบ
const test = async() => {
    const result = await transformImgUrl(process.env.TEST_OBJECT_URL); // for example: https://mybucket.s3.ap-southeast-1.amazonaws.com/items/image.png
    console.log(result);
}
test();