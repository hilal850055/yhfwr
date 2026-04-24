const { Client, LocalAuth } = require('./index.js');
const qrcode = require('qrcode-terminal');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// 1. إعدادات الوصول
const creds = require('./credentials.json');
const SPREADSHEET_ID = '1u0GeGEXBNnrrsLT79LpoGID2qq0mi4OuldIsFNtSiSE'; 

const auth = new JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet(SPREADSHEET_ID, auth);

const client = new Client({
    authStrategy: new LocalAuth(), //
    puppeteer: {
        headless: true, //
        // تم إزالة executablePath ليعتمد النظام على التثبيت التلقائي
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ] //
    }
});

// متغير لمنع التكرار (isProcessing)
let isProcessing = false; 

async function checkSheetAndSend() {
    if (isProcessing) return; // الخروج إذا كانت هناك عملية جارية بالفعل
    isProcessing = true;

    try {
        await doc.loadInfo(); 
        const sheet = doc.sheetsByIndex[0]; 
        const rows = await sheet.getRows();

        for (let row of rows) {
            let status = row.get('الحالة'); 
            let number = row.get('رقم الهاتف');
            let message = row.get('الرسالة');

            // التحقق من الحالة "تم"
            if (status === 'تم' && number && message) {
                // تحديث الحالة فوراً في الشيت لمنع التكرار قبل البدء بالإرسال
                row.set('الحالة', 'جاري الإرسال...');
                await row.save();

                let cleanNumber = number.toString().replace(/\D/g, '');
                const chatId = `${cleanNumber}@c.us`;

                try {
                    await client.sendMessage(chatId, message);
                    console.log(`✅ تم الإرسال بنجاح للرقم: ${cleanNumber}`);
                    
                    row.set('الحالة', 'Sent'); // تحديث الحالة النهائية
                    await row.save();
                } catch (err) {
                    console.error(`❌ فشل الإرسال للرقم ${cleanNumber}:`, err.message);
                    row.set('الحالة', 'Error');
                    await row.save();
                }
                
                // تأخير لمدة ثانيتين بين كل عميل وآخر لتجنب الحظر
                await new Promise(r => setTimeout(r, 700));
            }
        }
    } catch (error) {
        console.error('خطأ في الاتصال بـ Google Sheets:', error.message);
    } finally {
        isProcessing = false; // السماح بالفحص القادم بعد الانتهاء
    }
}

// توليد رمز QR
client.on('qr', (qr) => qrcode.generate(qr, { small: true }));

client.on('ready', () => {
    console.log('✅ البوت متصل وجاهز للعمل بدون تكرار!');
    // تم زيادة مدة الفحص لـ 10 ثوانٍ لزيادة الاستقرار
    setInterval(checkSheetAndSend, 5000); 
});

client.initialize();