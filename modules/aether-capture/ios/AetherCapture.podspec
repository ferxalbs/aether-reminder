Pod::Spec.new do |s|
  s.name           = 'AetherCapture'
  s.version        = '1.0.0'
  s.summary        = 'AETHER Universal Capture native ingress boundary'
  s.description    = 'App-owned system capture ingress and asset lifecycle.'
  s.license        = { :type => 'MIT' }
  s.author         = { 'AETHER' => 'support@aether.local' }
  s.homepage       = 'https://github.com/ferxalbs/aether-reminder'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
end
