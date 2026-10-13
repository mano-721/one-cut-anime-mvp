// Vercel Node.js Function. Set GEMINI_API_KEY in Vercel environment variables.
// API contract: https://ai.google.dev/gemini-api/docs/generate-content/image-generation
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 사용할 수 있어요.' });
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'AI 연결 준비 중이에요. Vercel에 GEMINI_API_KEY를 설정한 뒤 다시 배포해주세요.' });
  const body = req.body;
  if (!body || body.mimeType !== 'image/jpeg' || typeof body.image !== 'string' || body.image.length < 8 || body.image.length > 4000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.image)) {
    return res.status(400).json({ error: '사진을 확인할 수 없어요. 사진을 다시 선택해주세요.' });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 110000);
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { text: 'Transform the supplied photo into a polished 2D anime animation still. Keep the original subjects, recognizable facial identity, composition, pose, clothing and scene. Use clean hand-drawn outlines, expressive natural features, soft cel shading and a warm cinematic color palette. Render the whole scene as a cohesive 2D illustration, not a photographic filter, not 3D. Do not add text, logos, frames or extra people. Return a single edited image.' },
          { inlineData: { mimeType: 'image/jpeg', data: body.image } }
        ] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
      })
    });
    if (!response.ok) {
      const message = response.status === 429 ? '지금 요청이 많거나 API 사용 한도에 도달했어요. 잠시 후 다시 시도해주세요.'
        : [401, 403].includes(response.status) ? 'AI 연결 권한을 확인해주세요. Vercel의 API 키와 Gemini 이용 권한을 확인해야 해요.'
        : 'AI가 사진을 바꾸지 못했어요. 잠시 후 다시 시도해주세요.';
      return res.status(response.status === 429 ? 429 : 502).json({ error: message });
    }
    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const image = parts.find(part => !part.thought && part.inlineData?.data && /^image\/(png|jpeg|webp)$/.test(part.inlineData.mimeType));
    if (!image) return res.status(422).json({ error: '이 사진은 변환 결과를 만들지 못했어요. 다른 사진으로 다시 시작해주세요.' });
    return res.status(200).json({ image: image.inlineData.data, mimeType: image.inlineData.mimeType });
  } catch (error) {
    return res.status(error.name === 'AbortError' ? 504 : 502).json({ error: error.name === 'AbortError' ? '변환 시간이 길어지고 있어요. 잠시 후 다시 시도해주세요.' : 'AI에 연결하지 못했어요. 잠시 후 다시 시도해주세요.' });
  } finally { clearTimeout(timer); }
};
module.exports.config = { maxDuration: 120 };
