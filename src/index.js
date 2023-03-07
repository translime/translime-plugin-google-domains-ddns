const path = require('path');
const fs = require('fs');
const tunnel = require('tunnel');
const axios = require('axios');
const axiosHttpAdapter = require('axios/lib/adapters/http');
const pkg = require('../package.json');

const id = pkg.name;
const pluginDir = path.resolve(global.APPDATA_PATH, 'google-domains-ddns');
const logFile = path.resolve(pluginDir, 'logs.txt');

let timer;
const checkPluginDir = () => {
  fs.access(pluginDir, fs.constants.F_OK, (err) => {
    if (err) {
      fs.mkdirSync(pluginDir);
    }
  });
};
const logs = [];
const pushLog = (log) => {
  const logContent = `${(new Date()).toString()}: ${log}`;
  logs.push(logContent);
  fs.appendFileSync(logFile, `${logContent}\n`);
  if (logs.length > 300) {
    logs.shift();
  }
  if (global.childWins[`plugin-window-${id}`]) {
    global.ipc.sendToClient('logs', logs, global.childWins[`plugin-window-${id}`]);
  }
};
const getIp = (type = 4) => new Promise(async (resolve, reject) => {
  const url = type === 6 ? 'https://ipv6.icanhazip.com' : 'https://icanhazip.com';
  try {
    const { data } = await axios.get(url, {
      adapter: axiosHttpAdapter,
      responseType: 'text',
    });
    resolve(data.trim());
  } catch (err) {
    reject(new Error(`获取 ipv${type} 失败`));
  }
});
const setRecord = (hostname, username, password, ip, proxy) => new Promise(async (resolve, reject) => {
  try {
    const basicAuth = btoa(`${username}:${password}`);
    const { data } = await axios.post('https://domains.google.com/nic/update', null, {
      adapter: axiosHttpAdapter,
      params: {
        hostname,
        myip: ip,
      },
      timeout: 60000,
      responseType: 'text',
      headers: {
        Authorization: `Basic ${basicAuth}`,
      },
      httpsAgent: proxy,
      proxy: false,
    });
    pushLog(`接口返回值：${data}`);
    if (/^good|nochg/.test(data)) {
      resolve(data);
    } else {
      reject(new Error(`设置 dns 失败: ${data}`));
    }
  } catch (err) {
    reject(new Error('设置 dns 失败'));
  }
});
const main = async (hostname, username, password, proxy, type = 4) => {
  try {
    const ip = await getIp(type);
    await setRecord(hostname, username, password, ip, proxy);
    pushLog(`dns 已设置为: ${ip}`);
  } catch (err) {
    pushLog(err.message);
  }
};
const intervalCall = (hostname, username, password, proxy, type = 4) => {
  if (+type === 4) {
    main(hostname, username, password, proxy, 4);
  }
  if (+type === 6) {
    main(hostname, username, password, proxy, 6);
  }
  timer = setTimeout(() => {
    intervalCall(hostname, username, password, proxy, type);
  }, 30 * 60 * 1000);
};
const start = () => {
  if (timer) {
    return;
  }
  let proxy = null;
  const setting = global.store.get(`plugin.${id}.settings`, {});
  if (!setting['sub-domain'] || !setting.domain || !setting.username || !setting.password) {
    pushLog('请先配置');
    return;
  }
  // https://username:password@host:port
  if (setting.proxy) {
    const proxySetting = {
      host: '127.0.0.1',
      port: 1080,
      auth: {
        username: null,
        password: null,
      },
      proxyAuth: null,
    };
    const [protocol, fullUrl] = setting.proxy.split('://');
    const splitUrl = fullUrl.split('@');
    if (splitUrl.length > 1) {
      [proxySetting.proxyAuth] = splitUrl;
      [proxySetting.host, proxySetting.port] = splitUrl[1].split(':');
    } else {
      [proxySetting.host, proxySetting.port] = splitUrl[0].split(':');
      delete proxySetting.auth;
    }
    if (protocol === 'https') {
      proxy = tunnel.httpsOverHttp({
        proxy: proxySetting,
      });
    } else if (protocol === 'http') {
      proxy = tunnel.httpsOverHttps({
        proxy: proxySetting,
      });
    }
  }
  intervalCall(`${setting['sub-domain']}.${setting.domain}`, setting.username, setting.password, proxy, setting['ip-type']);
};
const stop = () => {
  clearTimeout(timer);
  timer = null;
};

// 加载时执行
const pluginDidLoad = () => {
  checkPluginDir();
  const setting = global.store.get(`plugin.${id}.settings`, {});
  if (setting['start-on-boot']) {
    start();
  }
};

// 禁用时执行
const pluginWillUnload = () => {
  stop();
};

// 插件设置表单
const settingMenu = [
  {
    key: 'username',
    type: 'input',
    name: '用户名',
    required: true,
    placeholder: '相关动态dns生成的用户名',
  },
  {
    key: 'password',
    type: 'password',
    name: '密码',
    required: true,
    placeholder: '相关动态dns生成的密码',
  },
  {
    key: 'sub-domain',
    type: 'input',
    name: '子域名',
    required: true,
  },
  {
    key: 'domain',
    type: 'input',
    name: '域名',
    required: true,
  },
  {
    key: 'proxy',
    type: 'input',
    name: '使用代理',
    placeholder: '设置格式：http://[username:password@]host:port',
  },
  {
    key: 'start-on-boot',
    type: 'switch',
    name: '启动 app 时自动运行',
  },
  {
    key: 'ip-type',
    type: 'radio',
    name: 'ip 类型',
    choices: [
      {
        name: 'ipv4',
        value: 4,
      },
      {
        name: 'ipv6',
        value: 6,
      },
    ],
  },
];

// ipc 定义
const ipcHandlers = [
  {
    type: 'start',
    handler: () => () => {
      start();
    },
  },
  {
    type: 'stop',
    handler: () => () => {
      stop();
    },
  },
  {
    type: 'isRunning',
    handler: () => () => {
      if (global.childWins[`plugin-window-${id}`]) {
        global.ipc.sendToClient('logs', logs, global.childWins[`plugin-window-${id}`]);
      }
      return Promise.resolve(!!timer);
    },
  },
];

// 窗口选项
const windowOptions = {
  minWidth: 320,
  width: 320,
  height: 240,
  frame: false,
  resizable: false,
  transparent: true,
  titleBarStyle: 'default',
};

module.exports = {
  pluginDidLoad,
  pluginWillUnload,
  settingMenu,
  ipcHandlers,
  windowOptions,
};
