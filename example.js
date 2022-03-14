require("dotenv").config();
const { MongoClient } = require("mongodb");
const AWS = require("aws-sdk");

const transformImgUrl = async (objectUrl) => {
    // เช็คว่าใช่ object url ของเราหรือไม่
    if (!objectUrl.includes("your aws s3 object url")) 
    return console.log("incorrect object url");

    // เชื่อมต่อ db และ collection (mongodb)
    const client = new MongoClient(process.env.DB_URL);
    await client.connect();
    const db = client.db("somethingDB");
    const presignedUrlCollection = db.collection("presignedUrl");

    const key = objectUrl.slice(60); // slice object key ออกจาก object url
    const result = await presignedUrlCollection.findOne({ key: key }); // หาว่ามีลิงก์ที่สร้างไว้แล้วหรือไม่
    const deadline = (result) ? result.age - (5 * 60 * 1000) : null; // หาอายุของลิงก์ - 5 นาที (หากมีลิงก์ที่สร้างไว้แล้ว)
    const now = new Date().getTime(); // เวลาปัจจุบัน

    // 1 เช็คว่าลิงก์ยังไม่หมดอายุ ใช้อันเดิมต่อได้ - return กลับได้เลย
    if (result && deadline && deadline > now) {
        return result.url;
    }
    // 2 ยังไม่มีลิงก์ที่สร้างไว้ใน mongodb หรือลิงก์หมดอายุแล้ว (เหลืออายุแค่ 5 นาทีก็ตัดเป็นหมดอายุเลย)
    else {
        // สร้างลิงก์ presigned url ใหม่ด้วย AWS SDK
        AWS.config.update({
            accessKeyId: process.env.ACCESS_KEY_ID, // AWS Access Key ID
            secretAccessKey: process.env.SECRET_ACCESS_KEY, // AWS Secret Access Key
            region: "ap-southeast-1" // AWS Region
        });
        const s3 = new AWS.S3();
        let newPresignedUrl = s3.getSignedUrl('getObject', {
            Bucket: process.env.BUCKET_NAME, // ชื่อ bucket
            Key: key,
            Expires: 60 * 60 // อายุลิงก์ (วินาที)
        });

        const newPresignedUrlData = { // เตรียมข้อมูลที่จะส่งไปเก็บใน mongodb
            key: key,
            url: newPresignedUrl,
            age: new Date().getTime() + 3_600_000 //อายุลิงก์ (milli seconds)
        }

        // 1.1 ถ้าสร้างลิงก์ครั้งแรกก็ใช้ insertOne
        if (!result) await presignedUrlCollection.insertOne(newPresignedUrlData);
        // 1.2 ถ้าเคยมีแล้ว (แต่หมดอายุ) ก็ใช้คำสั่ง replaceOne เข้าไปแทนอันเก่า
        else if (deadline && deadline <= now)
        await presignedUrlCollection.replaceOne({ key: key }, newPresignedUrlData);

        return newPresignedUrl; // return ลิงก์ presigned url อันใหม่
    }
}

// ทดสอบ
const test = async() => {
    const result = await transformImgUrl("https://privatepetchdotblog.s3.ap-southeast-1.amazonaws.com/articlecard/jwt.png");
    console.log(result);
}
test();