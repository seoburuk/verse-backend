package service

import (
	"testing"

	"github.com/seoburuk/verse-backend/internal/domain"
)

func TestRankEntries(t *testing.T) {
	raw := []domain.RankingRaw{
		{UserID: 1, Username: "a", Streak: 3, ClearedVerses: 4, DictationPts: 2}, // 3*4+2 = 14
		{UserID: 2, Username: "b", Streak: 5, ClearedVerses: 2, DictationPts: 4}, // 5*2+4 = 14 (동점, user_id로 뒤)
		{UserID: 3, Username: "c", Streak: 0, ClearedVerses: 0, DictationPts: 7}, // 0*0+7 = 7
		{UserID: 4, Username: "d", Streak: 2, ClearedVerses: 5, DictationPts: 0}, // 2*5+0 = 10
	}

	got := rankEntries(raw)

	// 점수: 14, 14, 10, 7 → 순서 [1,2,4,3]
	wantOrder := []int64{1, 2, 4, 3}
	for i, e := range got {
		if e.UserID != wantOrder[i] {
			t.Fatalf("위치 %d: user %d 기대, %d 나옴", i, wantOrder[i], e.UserID)
		}
	}

	// 동점(14점) 두 명은 같은 rank 1, 그 다음은 rank 3(2를 건너뜀)
	if got[0].Rank != 1 || got[1].Rank != 1 {
		t.Fatalf("동점자 rank 기대 1,1 → %d,%d", got[0].Rank, got[1].Rank)
	}
	if got[2].Rank != 3 {
		t.Fatalf("동점 후 rank 기대 3 → %d", got[2].Rank)
	}

	// 점수 계산 검증(RankWeight 반영)
	if got[0].Score != 14 {
		t.Fatalf("점수 기대 14 → %d", got[0].Score)
	}
}
