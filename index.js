const express = require('express');
const PORT = 3000;
const app = express();
let courses = require("./data.js");
const multer = require("multer"); //Khai bao thu vien multer
const AWS = require("aws-sdk");
require("dotenv").config();
const path = require("path");
     

//register middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static("./views"))

// Cấu hình AWS
process.env.AWS_SDK_IS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = "1"; // Kể từ 2023 và đã deprecated, ta chọn sử dụng aws-sdk javascript v2 thay vì v3
// Cấu hình aws sdk để truy cập vào Cloud Aws thông qua tài khoàn IAM user

AWS.config.update({
    region: process.env.REGION,
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
});
const S3 = new AWS.S3(); // Khai bão service 53
const dynamodb = new AWS.DynamoDB.DocumentClient(); // Khai báo service DynamoDB
const bucketName = process.env.S3_BUCKET_NAME;
const tableName = process.env.DYNAMODB_TABLE_NAME;

// Cấu hình multer quản lý upload image
const storage = multer.memoryStorage({
    destination(req, file, callback) {
        callback(null, "")
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 2000000 }, // Chỉ cho phép file tối đa là 2MB
    fileFilter(req, file, cb) {
        checkFileType(file, cb);
    },
});

function checkFileType(file, cb) {
    const fileTypes = /jpeg|jpg|png|gif/;
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = fileTypes.test(file.mimetype);
    if (extname && mimetype) {
        return cb(null, true);
    }
    return cb("Error: Pls upload images /jpeg|jpg|png|gif/ only!");
}
app.get("/", async (req, res) => {
    try {
        const params = { TableName: tableName };
        const data = await dynamodb.scan(params).promise(); // Dùng hàm scan để lấy toàn bộ dữ liệu trong table DynamoDB
        console.log("data=", data.Items);
        return res.render("index.ejs", { data: data.Items }); // Dùng biên response de render trang index.ejs đồng thời truyền biến data
    } catch (error) {
        console.error("Error retrieving data from DynamoDB:", error);
        return res.status(500).send("Internal Server Error");
    }
});



app.post("/save", upload.single("image"), (req, res) => {
    try {
        const maSanPham = Number(req.body.maSanPham);
        const image = req.file?.originalname.split(".");
        const soLuong = Number(req.body.soLuong);
        if (isNaN(soLuong)) {
            // Nếu giá trị không phải là số, trả về một thông báo lỗi hoặc xử lý khác tùy thuộc vào yêu cầu của bạn.
            return res.status(400).send("Invalid value for 'soLuong'. It must be a number.");
        }
        const tenSanPham = req.body.tenSanPham;
        console.log("maSanPham", maSanPham)
        console.log("tenSanPham", tenSanPham)
        console.log("soLuong", soLuong)

        const fileType = image[image.length - 1];
        const filePath = `${maSanPham}_${Date.now().toString()}.${fileType}`;


        const paramsS3 = {
            Bucket: bucketName,
            Key: filePath,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        };
        S3.upload(paramsS3, async (err, data) => { // Upload ảnh lên 53 trước
            if (err) {
                console.error("error-", err);
                return res.send("Internal server error!");
            } else { // Khi upload 53 thành công const ImageURL data.Location;// Gån URL, 53 trả về vào field trong table DynamoDB
                const imageURL = data.Location; // Gán URL, S3 trả về vào field trong table DynamoDB
                const paramsDynamoDb = {
                    TableName: tableName,
                    Item: {
                        maSanPham: Number(maSanPham), // Include maSanPham attribute with its value
                        image: imageURL,
                        soLuong: Number(soLuong),
                        tenSanPham: tenSanPham,

                    }
                };
                await dynamodb.put(paramsDynamoDb).promise();
                return res.redirect("/"); // Render lại trang Index để cập nhật dữ liệu table
            }
        })
    } catch (error) {
        console.log("error saving data from DymanoDB", error);
        return res.status(500).send("Internal Server error")
    }
})

app.post('/delete', upload.fields([]), (req, res) => {
    const listCheckboxSelected = Object.keys(req.body);
    if (!listCheckboxSelected.length) {
        return res.redirect("/");
    }
    try {
        function onDelete(length) {
            const params = {
                TableName: tableName,
                Key: {
                    maSanPham: Number(listCheckboxSelected[length])
                }
            };
            dynamodb.delete(params, (err, data) => {
                if (err) {
                    console.error("error=", err);
                    return res.send("Internal server error!");
                }
                else if (length > 0) {
                    onDelete(length - 1);
                }
                else {
                    return res.redirect("/");
                }
            });
        }
        onDelete(listCheckboxSelected.length - 1);
    }
    catch (error) {
        console.error("error deleting data from DynamoDB", error);
        return res.status(500).send("Internal Server error")
    }
})


//config view
app.set('view engine', 'ejs');
app.set('views', './views');

app.get('/', (req, resp) => {
    return resp.render('index', { courses }) //send data to ejs
})

app.listen(PORT, () => {
    console.log(`Server is running on Port ${PORT}`);
})
