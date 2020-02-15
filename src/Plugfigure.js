import YAML from 'yaml';
import fs from 'fs';

// We may want to pull this from somewhere. Not sure yet.
const maxRecursion = 25;

const watchers = new WeakMap();
const plugins = new WeakMap();

function notifyWatchers(instance) {
  const myWatchers = watchers.get(instance);
  myWatchers.forEach(({key, watcher}) => {
    const newVal = instance.getValue(key);
    watcher(newVal);
  });
}

export default class Plugfigure {
  constructor(installedPlugins = {}) {
    if (typeof plugins !== 'object') throw new TypeError('Plugins must be an object');
    Object.entries(plugins).forEach(([name, plugin]) => {
      if (typeof plugin !== 'function') {
        throw new TypeError(`Plugin ${name} is not a function`);
      }
    });

    plugins.set(this, installedPlugins);
    watchers.set(this, []);
  }

  async load(file, options = 'utf8') {
    const filecontents = await new Promise((resolve, reject) => {
      fs.readFile(file, options, (err, data) => err ? reject(err) : resolve(data));
    });

    this.loaded = YAML.parse(filecontents);
    notifyWatchers(this);
  }

  async loadAndWatch(file, options = 'utf8') {
    await this.load(file, options);

    fs.watch(file, {
      persistent: false,
      recursive: false,
      encoding: typeof options === 'string' ? options : options.encoding || 'utf8',
    }, (eventType) => {
      if (eventType === 'change') this.load(file, options);
    });
  }

  async getValueFromData(data, key, watcher = () => {}) {
    if (typeof watcher !== 'function') {
      throw new TypeError('Watcher must be a function');
    }

    const [current, ...remaining] = typeof key === 'string' ? key.split('.') : key;
    if (!current || !data) return data;

    let nextVal = data[current];

    for (let i = 0; i < maxRecursion && typeof nextVal === 'string' && nextVal.startsWith('@'); i++) {
      const [pluginNameRaw, ...splitReq] = nextVal.split(' ');
      const pluginName = pluginNameRaw.substring(1);
      const pluginReq = splitReq.join(' ');

      const myPlugins = plugins.get(this);
      const plugin = myPlugins[pluginName];
      if (!plugin) throw new Error(`No plugin ${pluginName} installed`);

      nextVal = await plugin(pluginReq, (newVal) => {
        const newFinalVal = this.getValueFromData(newVal, key, watcher);
        watcher(newFinalVal);
      });
    }

    if (typeof nextVal === 'string' && nextVal.startsWith('@')) {
      throw new Error('Max recursion reached. Possible loop detected.');
    }

    if (typeof nextVal === 'string' && nextVal.startsWith('\@')) {
      nextVal = nextVal.substring(1);
    }

    return this.getValueFromData(nextVal, remaining, watcher);
  }

  async getValue(key, watcher) {
    if (watcher) {
      if (typeof watcher !== 'function') {
        throw new TypeError('Watcher must be a function');
      }

      watchers.get(this).push({
        key,
        watcher,
      });
    }
    return this.getValueFromData(this.loaded, key, watcher);
  }
}


