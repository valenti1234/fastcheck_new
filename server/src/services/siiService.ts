import axios from 'axios';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SII_URL = process.env.SII_URL || 'https://zeus.sii.cl/cvc/stc/stc.html';

export class SIIService {
  private static async getCaptchaImage(): Promise<Buffer> {
    try {
      // Create a session and get the main page
      const response = await axios.get(SII_URL);
      const $ = cheerio.load(response.data);
      
      // Find the CAPTCHA image
      const imgTag = $('img#imgcaptcha');
      if (!imgTag.length) {
        throw new Error('CAPTCHA image not found');
      }

      // Get the image URL and download it
      const imgSrc = imgTag.attr('src');
      if (!imgSrc) {
        throw new Error('CAPTCHA image source not found');
      }

      const imgUrl = `https://zeus.sii.cl${imgSrc}`;
      const imgResponse = await axios.get(imgUrl, {
        responseType: 'arraybuffer'
      });

      return Buffer.from(imgResponse.data);
    } catch (error) {
      console.error('Error getting CAPTCHA image:', error);
      throw error;
    }
  }

  private static async solveCaptcha(imgBuffer: Buffer): Promise<string> {
    try {
      const base64Image = imgBuffer.toString('base64');
      
      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL_VISION || "gpt-4-vision-preview",
        messages: [
          {
            role: "system",
            content: "You are a CAPTCHA solver."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "What number do you see in this CAPTCHA image? Return only the number."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: Number(process.env.OPENAI_MAX_TOKENS) || 10
      });

      return response.choices[0].message.content?.trim() || '';
    } catch (error) {
      console.error('Error solving CAPTCHA:', error);
      throw error;
    }
  }

  private static async querySII(rut: string, dv: string, captchaText: string): Promise<string> {
    try {
      const payload = {
        RUT: rut,
        DV: dv,
        codigoCaptcha: captchaText
      };

      const headers = {
        'Referer': SII_URL,
        'Content-Type': 'application/x-www-form-urlencoded'
      };

      const response = await axios.post(SII_URL, new URLSearchParams(payload), { headers });
      return response.data;
    } catch (error) {
      console.error('Error querying SII:', error);
      throw error;
    }
  }

  static async getCompanyInfo(rut: string, dv: string): Promise<{
    success: boolean;
    message: string;
    data?: string;
  }> {
    try {
      const captchaImage = await this.getCaptchaImage();
      const captchaText = await this.solveCaptcha(captchaImage);
      const result = await this.querySII(rut, dv, captchaText);

      return {
        success: true,
        message: 'Successfully retrieved company information',
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get company information'
      };
    }
  }
} 