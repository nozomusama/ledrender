import { GoogleGenAI } from "@google/genai";

export const generateAIRender = async (apiKey, imageBase64, prompt) => {
    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });

        // Remove the data URL prefix to get just the base64 string
        const base64Data = imageBase64.split(',')[1];

        const contents = [
            {
                role: 'user',
                parts: [
                    { text: prompt },
                    {
                        inlineData: {
                            mimeType: 'image/png',
                            data: base64Data
                        }
                    }
                ],
            },
        ];

        const config = {
            responseModalities: ['IMAGE', 'TEXT'], // Request both, but we prioritize image
            // imageConfig: { imageSize: '1K' } // Optional, depending on model support
        };

        // Using the user-specified model
        const model = 'gemini-3-pro-image-preview';

        const response = await ai.models.generateContent({
            model,
            config,
            contents,
        });

        // Parse response for Image
        // The structure might vary, but typically it's in candidates[0].content.parts
        const parts = response.candidates?.[0]?.content?.parts;
        if (parts) {
            for (const part of parts) {
                if (part.inlineData) {
                    // Found an image!
                    const mimeType = part.inlineData.mimeType || 'image/png';
                    const imageData = part.inlineData.data;
                    return {
                        success: true,
                        image: `data:${mimeType};base64,${imageData}`,
                        text: "Görsel başarıyla oluşturuldu."
                    };
                }
            }
            // If no image found, check for text
            const textPart = parts.find(p => p.text);
            if (textPart) {
                return { success: true, text: textPart.text, isTextOnly: true };
            }
        }

        return { success: false, error: "No image or text generated." };

    } catch (error) {
        console.error("AI Generation Error:", error);
        return { success: false, error: error.message || "Bilinmeyen bir hata oluştu." };
    }
};
