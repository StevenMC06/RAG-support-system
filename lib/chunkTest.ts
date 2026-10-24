import { getEncoding } from "js-tiktoken";

const tokenizer = getEncoding("cl100k_base");

export type TextChunk = {
    content: string;
    chunkIndex: number;
    tokenCount: number;
};

type ChunkUnit = {
    text: string;
    tokenCount: number;
};

type ChunkOptions = {
    targetTokens?: number;
    maxTokens?: number;
    overlapTokens?: number;
};

function countTokens(text: string): number {
    return tokenizer.encode(text).length;
}

function cleanText(text: string): string {
    return text
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function splitIntoSentences(text: string): string[] {
    return (
        text
            .match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g)
            ?.map((sentence) => sentence.trim())
            .filter(Boolean) ?? []
    );
}

// splitOversizedText is a function that splits the text into smaller units if it is larger than the maxTokens
function splitOversizedText(
    text: string,
    maxTokens: number
): ChunkUnit[] {
    const tokenIds = tokenizer.encode(text);
    const units: ChunkUnit[] = [];

    for (let start = 0; start < tokenIds.length; start += maxTokens) {
        const tokenSlice = tokenIds.slice(start, start + maxTokens);
        const decoded = tokenizer.decode(tokenSlice).trim();

        if (!decoded) {
            continue;
        }

        units.push({
            text: decoded,
            tokenCount: tokenSlice.length,
        });
    }

    return units;
}

// createUnits is a function that creates the units from the text
function createUnits(
    text: string,
    maxTokens: number
): ChunkUnit[] {
    const paragraphs = text
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);

    const units: ChunkUnit[] = [];

    for (const paragraph of paragraphs) {
        const paragraphTokenCount = countTokens(paragraph);

        if (paragraphTokenCount <= maxTokens) {
            units.push({
                text: paragraph,
                tokenCount: paragraphTokenCount,
            });

            continue;
        }

        const sentences = splitIntoSentences(paragraph);

        for (const sentence of sentences) {
            const sentenceTokenCount = countTokens(sentence);

            if (sentenceTokenCount <= maxTokens) {
                units.push({
                    text: sentence,
                    tokenCount: sentenceTokenCount,
                });
            } else {
                units.push(
                    ...splitOversizedText(sentence, maxTokens)
                );
            }
        }
    }

    return units;
}

// getOverlapUnits is a function that gets the overlap units from the previous units
function getOverlapUnits(
    previousUnits: ChunkUnit[],
    overlapTokens: number
): ChunkUnit[] {
    if (overlapTokens === 0) {
        return [];
    }

    const overlapUnits: ChunkUnit[] = [];
    let totalTokens = 0;

    for (let index = previousUnits.length - 1; index >= 0; index--) {
        const unit = previousUnits[index];

        if (
            overlapUnits.length > 0 &&
            totalTokens + unit.tokenCount > overlapTokens
        ) {
            break;
        }

        overlapUnits.unshift(unit);
        totalTokens += unit.tokenCount;

        if (totalTokens >= overlapTokens) {
            break;
        }
    }

    return overlapUnits;
}

// chunkText is a function that chunks text into smaller units
export function chunkText(
    rawText: string,
    options: ChunkOptions = {}
): TextChunk[] {
    const {
        targetTokens = 500,
        maxTokens = 600,
        overlapTokens = 75,
    } = options;

    if (targetTokens <= 0) {
        throw new Error("targetTokens must be greater than 0");
    }

    if (maxTokens < targetTokens) {
        throw new Error(
            "maxTokens must be greater than or equal to targetTokens"
        );
    }

    if (overlapTokens < 0 || overlapTokens >= targetTokens) {
        throw new Error(
            "overlapTokens must be non-negative and smaller than targetTokens"
        );
    }

    const cleanedText = cleanText(rawText);

    if (!cleanedText) {
        return [];
    }

    const units = createUnits(cleanedText, maxTokens);
    const chunks: TextChunk[] = [];

    let currentUnits: ChunkUnit[] = [];
    let currentTokenCount = 0;

    for (const unit of units) {
        const separatorTokens = currentUnits.length > 0 ? 1 : 0;
        const proposedTokenCount =
            currentTokenCount +
            separatorTokens +
            unit.tokenCount;

        if (
            currentUnits.length > 0 &&
            proposedTokenCount > targetTokens
        ) {
            const content = currentUnits
                .map((currentUnit) => currentUnit.text)
                .join("\n\n");

            chunks.push({
                content,
                chunkIndex: chunks.length,
                tokenCount: countTokens(content),
            });

            currentUnits = getOverlapUnits(
                currentUnits,
                overlapTokens
            );

            // A unit may be as large as maxTokens on its own, so the overlap
            // carried forward can push the next chunk over the ceiling. Drop
            // the oldest overlap units until the incoming unit fits.
            while (
                currentUnits.length > 0 &&
                countTokens(
                    [...currentUnits, unit]
                        .map((currentUnit) => currentUnit.text)
                        .join("\n\n")
                ) > maxTokens
            ) {
                currentUnits.shift();
            }

            currentTokenCount = countTokens(
                currentUnits
                    .map((currentUnit) => currentUnit.text)
                    .join("\n\n")
            );
        }

        currentUnits.push(unit);

        currentTokenCount = countTokens(
            currentUnits
                .map((currentUnit) => currentUnit.text)
                .join("\n\n")
        );

        if (currentTokenCount > maxTokens) {
            throw new Error(
                `Chunk exceeded maxTokens: ${currentTokenCount}`
            );
        }
    }

    if (currentUnits.length > 0) {
        const content = currentUnits
            .map((unit) => unit.text)
            .join("\n\n");

        chunks.push({
            content,
            chunkIndex: chunks.length,
            tokenCount: countTokens(content),
        });
    }

    return chunks;
}