import { requestAIContent, isAIContentServerConfigured } from './ai_content_client';
import {
  generatePost,
  generatePostVariants,
  generatePostWithAI,
  generateTemplatePost,
} from './content_generator';

jest.mock('./ai_content_client', () => ({
  requestAIContent: jest.fn(),
  isAIContentServerConfigured: jest.fn(),
}));

describe('content generator', () => {
  beforeEach(() => jest.clearAllMocks());

  test('generates template content without any provider key', () => {
    const text = generateTemplatePost('Cửa cổng sắt', {
      tone: 'neutral',
      length: 'short',
      hashtags: ['DaiHaiPhat'],
    });
    expect(text).toContain('Cửa cổng sắt');
    expect(text).toContain('#DaiHaiPhat');
  });

  test('caps variant generation', () => {
    const variants = generatePostVariants('Nội thất', {}, 99);
    expect(variants.length).toBeLessThanOrEqual(10);
    expect(variants.length).toBeGreaterThan(0);
  });

  test('uses server-side AI gateway when explicitly requested', async () => {
    isAIContentServerConfigured.mockReturnValue(true);
    requestAIContent.mockResolvedValue({ text: 'Bài viết từ Gemini', model: 'gemini-2.5-flash' });

    await expect(generatePostWithAI('Tủ bếp', { tone: 'friendly' })).resolves.toBe('Bài viết từ Gemini');
    expect(requestAIContent).toHaveBeenCalledWith(expect.objectContaining({
      topic: 'Tủ bếp',
      tone: 'friendly',
    }));
  });

  test('does not silently label template output as AI when gateway is missing', async () => {
    isAIContentServerConfigured.mockReturnValue(false);
    await expect(generatePostWithAI('Tủ bếp')).rejects.toThrow(/AI Content Server chưa cấu hình/);
    expect(requestAIContent).not.toHaveBeenCalled();
  });

  test('generic generation falls back to template if gateway request fails', async () => {
    isAIContentServerConfigured.mockReturnValue(true);
    requestAIContent.mockRejectedValue(new Error('offline'));
    const text = await generatePost('Lan can sắt');
    expect(text).toContain('Lan can sắt');
  });
});
