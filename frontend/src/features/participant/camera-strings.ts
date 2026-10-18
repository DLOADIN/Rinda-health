// The camera helper's text loads with the camera helper, so it is not part of everyone's first download.
import { i18n } from '@/lib/i18n';
import en from '@/locales/en/camera.json';
import rw from '@/locales/rw/camera.json';

i18n.addResourceBundle('en', 'common', en, true, true);
i18n.addResourceBundle('rw', 'common', rw, true, true);
