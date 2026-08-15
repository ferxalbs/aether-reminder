const { createRunOncePlugin } = require('expo/config-plugins');

function withAetherMotion(config) {
  config.ios = config.ios ?? {};
  config.ios.infoPlist = {
    ...(config.ios.infoPlist ?? {}),
    // Allow supported higher refresh rates. This is not a command to render at 120 Hz.
    CADisableMinimumFrameDurationOnPhone: true,
  };
  return config;
}

module.exports = createRunOncePlugin(withAetherMotion, 'aether-motion', '1.0.0');
