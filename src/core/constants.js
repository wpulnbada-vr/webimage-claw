const EXCLUDE_PATTERNS = [
  'rating_off', 'rating_on', 'loading.gif', 'avatar', 'logo', 'icon',
  'favicon', 'emoji', 'star', 'close-icon', 'wp-postratings',
  'advertisement', 'banner', 'placeholder', 'spinner',
];

const BLOCKED_SCRIPTS = ['disabley', 'disable-devtool', 'devtools-detect'];
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|webp|gif|bmp)(\?|$)/i;

module.exports = { EXCLUDE_PATTERNS, BLOCKED_SCRIPTS, IMAGE_EXTENSIONS };
