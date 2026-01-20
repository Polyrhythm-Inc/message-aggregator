import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logger.warn('GEMINI_API_KEYが未設定のため翻訳を実行できません');
      return NextResponse.json(
        { success: false, error: 'GEMINI_API_KEY is not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { success: false, error: 'text is required and must be a string' },
        { status: 400 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `以下のテキストを日本語に翻訳してください。翻訳結果のみを出力し、説明は不要です。

${text}`;

    const result = await model.generateContent(prompt);
    const translatedText = result.response.text().trim();

    if (!translatedText) {
      logger.warn('Gemini APIから翻訳結果が返されませんでした');
      return NextResponse.json(
        { success: false, error: 'No translation result from Gemini API' },
        { status: 502 }
      );
    }

    logger.info({ textLength: text.length, translatedLength: translatedText.length }, '翻訳を実行しました');

    return NextResponse.json({
      success: true,
      translatedText,
    });
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, '翻訳中にエラーが発生しました');
    return NextResponse.json(
      { success: false, error: 'Translation failed' },
      { status: 500 }
    );
  }
}
