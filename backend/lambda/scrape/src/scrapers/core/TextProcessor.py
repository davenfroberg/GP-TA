from bs4 import BeautifulSoup
import re
import hashlib
from config.constants import CHUNK_SIZE_WORDS

class TextProcessor:
    """Handles text cleaning and chunking operations"""
    
    @staticmethod
    def clean_html_text(raw_html):
        """Clean HTML content and return plain text"""
        soup = BeautifulSoup(raw_html, "html.parser")
        text = soup.get_text(separator="\n")
        text = re.sub(r"&[#\w]+;", "", text)
        text = re.sub(r"\n\s*\n", "\n", text)
        return text.strip()

    @staticmethod
    def split_sentences(text):
        """Split text into sentences using punctuation"""
        sentences = re.split(r'(?<=[.!?])\s+', text)
        return [s.strip() for s in sentences if s.strip()]

    @staticmethod
    def generate_chunks(blob, chunk_size=CHUNK_SIZE_WORDS):
        """Generate text chunks from a blob with sentence overlap"""
        text = blob['content']
        title = blob.get('title')
        
        sentences = TextProcessor.split_sentences(text)
        
        chunks = []
        current_chunk = []
        current_word_count = 0

        for sentence in sentences:
            sentence_word_count = len(sentence.split())
            
            # Check if adding this sentence would exceed chunk size
            if current_word_count + sentence_word_count > chunk_size and current_chunk:
                # Finalize current chunk
                chunk_text = " ".join(current_chunk)
                if title:
                    chunk_text = f"Title: {title}\n\n{chunk_text}"
                chunks.append(chunk_text)
                
                # Start new chunk with previous sentence as overlap
                current_chunk = [current_chunk[-1]] if len(current_chunk) >= 1 else []
                current_word_count = sum(len(s.split()) for s in current_chunk)

            current_chunk.append(sentence)
            current_word_count += sentence_word_count

        # Add any remaining sentences as the last chunk
        if current_chunk:
            chunk_text = " ".join(current_chunk)
            if title:
                chunk_text = f"Title: {title}\n\n{chunk_text}"
            chunks.append(chunk_text)

        return chunks

    @staticmethod
    def compute_hash(text):
        """Generate SHA256 hash of text content"""
        return hashlib.sha256(text.encode("utf-8")).hexdigest()