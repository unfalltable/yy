let speechId = 0;
const speaking = (value: boolean) =>
  window.dispatchEvent(new CustomEvent('lingo-speech', { detail: value }));
export function stopSpeech() {
  speechId++;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  speaking(false);
}
export function speak(text: string, rate = 1, onError?: (text: string) => void) {
  if (!('speechSynthesis' in window)) {
    onError?.('当前环境不支持系统朗读');
    return;
  }
  const id = ++speechId;
  speechSynthesis.cancel();
  speaking(false);
  const language = /[\u4e00-\u9fff]/.test(text) ? 'zh-CN' : 'en-US';
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language;
  utterance.rate = rate;
  const voices = speechSynthesis.getVoices();
  utterance.voice =
    voices.find((v) => v.lang === language) ??
    voices.find((v) => v.lang.startsWith(language.slice(0, 2))) ??
    null;
  utterance.onstart = () => {
    if (id === speechId) speaking(true);
  };
  utterance.onend = () => {
    if (id === speechId) speaking(false);
  };
  utterance.onerror = (e) => {
    if (id === speechId) speaking(false);
    if (e.error !== 'interrupted' && e.error !== 'canceled')
      onError?.('朗读不可用，请在 Windows 语言设置中安装对应语言的语音包');
  };
  speechSynthesis.speak(utterance);
}
