const fs = require('fs');
const https = require('https');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
const env = fs.readFileSync(envPath, 'utf8');
const m = env.match(/^TELEGRAM_BOT_TOKEN\s*=\s*"?([^"\n]+)"?/m);
if(!m){console.error('NO_TOKEN'); process.exit(1);} 
const token = m[1];
https.get(`https://api.telegram.org/bot${token}/getUpdates`, res=>{
  let b='';
  res.on('data', c=> b+=c);
  res.on('end', ()=>{
    try{
      const j = JSON.parse(b);
      const ids = [];
      (j.result||[]).forEach(u=>{
        if(u.message && u.message.chat) ids.push(u.message.chat.id);
        if(u.channel_post && u.channel_post.chat) ids.push(u.channel_post.chat.id);
        if(u.edited_message && u.edited_message.chat) ids.push(u.edited_message.chat.id);
      });
      const unique = [...new Set(ids)];
      const last = j.result && j.result.length ? j.result[j.result.length-1] : null;
      console.log(JSON.stringify({unique, last}, null, 2));
    }catch(e){
      console.error('PARSE_ERR', e.message);
      console.log(b);
    }
  });
}).on('error', e=>{console.error('ERR', e.message); process.exit(1);});
