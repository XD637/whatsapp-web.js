const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');

const app = express();
const upload = multer({ dest: 'uploads/' }); // temporary folder for uploads

app.post('/upload-excel', upload.single('excel'), (req, res) => {
  try {
    const filePath = req.file.path;

    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert entire sheet to JSON (array of row-objects)
    const jsonData = xlsx.utils.sheet_to_json(sheet);

    // Replace 'Email' with whatever column name you want
    const desiredColumn = 'Phone number';

    // Extract the specific column values into an array
    const columnArray = jsonData.map(row => row[desiredColumn]).filter(Boolean); // filter removes undefined/null

    // Cleanup the uploaded file
    fs.unlinkSync(filePath);

    res.json({ success: true, data: columnArray });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to process file' });
  }
});



app.listen(3001, () => console.log('Server running on port http://localhost:3001')); 