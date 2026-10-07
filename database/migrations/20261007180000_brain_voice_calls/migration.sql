-- Cérebro: ligações de voz (áudio gravado tocado numa tela de ligação)
ALTER TABLE "brains" ADD COLUMN "voiceCalls" JSONB NOT NULL DEFAULT '[]';
