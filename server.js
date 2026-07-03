const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 静态文件托管
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// 文件读写工具
const readJson = (file) => {
  const buf = fs.readFileSync(path.join(__dirname, 'data', file), 'utf8');
  return JSON.parse(buf || '{}');
};
const writeJson = (file, data) => {
  fs.writeFileSync(path.join(__dirname, 'data', file), JSON.stringify(data, null, 2));
};

// 初始化数据文件夹与默认文件
if (!fs.existsSync('./data')) fs.mkdirSync('./data');
if (!fs.existsSync('./data/admin.json')) writeJson('admin.json', {
  name: '管理员',
  avatar: '',
  desc: '客服主账号',
  phone: '',
  remark: ''
});
if (!fs.existsSync('./data/qrcode_list.json')) writeJson('qrcode_list.json', []);
if (!fs.existsSync('./data/chat_records.json')) writeJson('chat_records.json', []);

// 接口：读取/保存管理员身份信息
app.get('/api/admin', (req, res) => res.json(readJson('admin.json')));
app.post('/api/admin', (req, res) => {
  writeJson('admin.json', req.body);
  res.json({ code: 200, msg: '管理员资料保存成功' });
});

// 接口：二维码渠道管理
app.get('/api/qrcode', (req, res) => res.json(readJson('qrcode_list.json')));
app.post('/api/qrcode/add', (req, res) => {
  const list = readJson('qrcode_list.json');
  const newItem = {
    id: Date.now().toString(),
    title: req.body.title || '渠道二维码',
    userTemplate: {
      name: { show: true, label: '姓名', required: true },
      company: { show: true, label: '公司', required: false },
      phone: { show: true, label: '手机号', required: true },
      remark: { show: false, label: '备注', required: false }
    }
  };
  list.push(newItem);
  writeJson('qrcode_list.json', list);
  res.json({ code: 200, data: newItem });
});
app.post('/api/qrcode/edit', (req, res) => {
  const list = readJson('qrcode_list.json');
  const idx = list.findIndex(item => item.id === req.body.id);
  if (idx > -1) list[idx] = req.body;
  writeJson('qrcode_list.json', list);
  res.json({ code: 200, msg: '二维码配置更新成功' });
});
app.delete('/api/qrcode/:id', (req, res) => {
  let list = readJson('qrcode_list.json');
  list = list.filter(item => item.id !== req.params.id);
  writeJson('qrcode_list.json', list);
  res.json({ code: 200 });
});

// WebSocket实时聊天通讯
let clients = new Map();
wss.on('connection', (ws) => {
  clients.set(ws, {});
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    const connInfo = clients.get(ws);
    // 访客提交身份资料
    if (msg.type === 'visitor_init') {
      connInfo.type = 'visitor';
      connInfo.qrcodeId = msg.qrcodeId;
      connInfo.userInfo = msg.userInfo;
      clients.set(ws, connInfo);
      clients.forEach((info, c) => {
        if (info.type === 'admin') c.send(JSON.stringify({
          type: 'new_visitor',
          qrcodeId: msg.qrcodeId,
          userInfo: msg.userInfo
        }));
      });
    }
    // 管理员登录
    if (msg.type === 'admin_login') {
      connInfo.type = 'admin';
      connInfo.adminInfo = readJson('admin.json');
      clients.set(ws, connInfo);
    }
    // 聊天消息广播与存储
    if (msg.type === 'chat') {
      clients.forEach((info, c) => c.send(raw));
      const records = readJson('chat_records.json');
      records.push({
        time: new Date().toLocaleString(),
        senderType: connInfo.type,
        qrcodeId: connInfo.qrcodeId || null,
        userInfo: connInfo.type === 'visitor' ? connInfo.userInfo : connInfo.adminInfo,
        content: msg.content
      });
      writeJson('chat_records.json', records);
    }
  });
  ws.on('close', () => clients.delete(ws));
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`服务启动，端口：${port}`);
});
