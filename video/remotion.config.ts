import {Config} from '@remotion/cli/config';

// WebGL through ANGLE on the Mac's GPU; the sky map draws 4 million points per frame.
Config.setChromiumOpenGlRenderer('angle');
Config.setVideoImageFormat('png');
Config.setPixelFormat('yuv420p');
Config.setCodec('h264');
Config.setCrf(16);
Config.setConcurrency(4);
Config.setDelayRenderTimeoutInMilliseconds(120000);
