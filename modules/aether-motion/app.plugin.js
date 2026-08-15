const { createRunOncePlugin } = require('expo/config-plugins');

function withAetherMotion(config) {
  config.ios = config.ios ?? {};
  config.ios.infoPlist = {
    ...(config.ios.infoPlist ?? {}),
    CADisableMinimumFrameDurationOnPhone: true,
  };
  return config;
}

module.exports = createRunOncePlugin(withAetherMotion, 'aether-motion', '1.0.0');
