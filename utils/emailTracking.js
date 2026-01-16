const buildBaseUrl = () => {
  return (
    process.env.BASE_URL ||
    process.env.API_URL ||
    'http://localhost:8080'
  );
};

const buildTrackingParams = (campaignId, recipientEmail) => {
  const params = new URLSearchParams();
  params.set('c', campaignId);
  if (recipientEmail) params.set('e', recipientEmail);
  params.set('t', Date.now().toString());
  return params.toString();
};

const buildTrackingPixel = (campaignId, recipientEmail) => {
  const baseUrl = buildBaseUrl();
  const params = buildTrackingParams(campaignId, recipientEmail);
  return `<img src="${baseUrl}/api/email-campaigns/track/open?${params}" width="1" height="1" style="display:none;" alt="" />`;
};

const addTrackingToHtml = (html, campaignId, recipientEmail) => {
  if (!html) return html;
  const pixel = buildTrackingPixel(campaignId, recipientEmail);
  if (html.includes('/api/email-campaigns/track/open')) {
    return html;
  }
  if (html.includes('</body>')) {
    return html.replace('</body>', `${pixel}</body>`);
  }
  return `${html}${pixel}`;
};

const wrapTrackedLink = (url, campaignId, recipientEmail) => {
  const baseUrl = buildBaseUrl();
  const params = new URLSearchParams();
  params.set('c', campaignId);
  if (recipientEmail) params.set('e', recipientEmail);
  params.set('u', url);
  return `${baseUrl}/api/email-campaigns/track/click?${params.toString()}`;
};

const addClickTracking = (html, campaignId, recipientEmail) => {
  if (!html) return html;
  return html.replace(/href=["']([^"']+)["']/gi, (match, url) => {
    if (!url || url.startsWith('mailto:') || url.startsWith('tel:')) {
      return match;
    }
    if (url.includes('/api/email-campaigns/track/click')) {
      return match;
    }
    const tracked = wrapTrackedLink(url, campaignId, recipientEmail);
    return `href="${tracked}"`;
  });
};

const addEmailTracking = (html, campaignId, recipientEmail) => {
  const withClicks = addClickTracking(html, campaignId, recipientEmail);
  return addTrackingToHtml(withClicks, campaignId, recipientEmail);
};

module.exports = {
  addEmailTracking,
  buildBaseUrl
};
