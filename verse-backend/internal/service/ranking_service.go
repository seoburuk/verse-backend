// ranking_service.go — 전역 랭킹(리더보드) 계산.
//
// 점수 = streak × 외운 절 수 × RankWeight + 받아쓰기 성공 수
//   - streak: 연속 학습일(streaks.current_len, 누적)
//   - 외운 절: progress.cleared 누적 (받아쓰기는 제외 — 완료로 치지 않음)
//   - 받아쓰기: mode='dictation' 성공(green) 1건당 1점
// RankWeight는 가중치 조정용 상수. 값만 바꾸면 되고 마이그레이션 불필요.
package service

import (
	"context"
	"sort"

	"github.com/seoburuk/verse-backend/internal/domain"
	"github.com/seoburuk/verse-backend/internal/repository"
)

// RankWeight — streak×외운절 항목의 가중치(조정값).
const RankWeight = 1

// RankingTopN — 리더보드 상위 노출 개수.
const RankingTopN = 20

type RankingService struct {
	attempts repository.AttemptRepo
}

func NewRankingService(attempts repository.AttemptRepo) *RankingService {
	return &RankingService{attempts: attempts}
}

func rankScore(r domain.RankingRaw) int {
	return r.Streak*r.ClearedVerses*RankWeight + r.DictationPts
}

// RankingResult — 상위 목록 + 요청 유저 본인 순위.
type RankingResult struct {
	Entries []domain.RankingEntry
	Me      *domain.RankingEntry
}

// GetRankings — 전체 유저 점수를 계산·정렬해 상위 N명과 요청 유저 순위를 반환한다.
func (s *RankingService) GetRankings(ctx context.Context, userID int64) (RankingResult, error) {
	raw, err := s.attempts.GetRankingRaw(ctx)
	if err != nil {
		return RankingResult{}, err
	}

	ranked := rankEntries(raw)

	res := RankingResult{}
	for i := range ranked {
		if i < RankingTopN {
			res.Entries = append(res.Entries, ranked[i])
		}
		if ranked[i].UserID == userID {
			me := ranked[i]
			res.Me = &me
		}
	}
	return res, nil
}

// rankEntries — 순수 함수. 점수 내림차순(동점은 user_id 오름차순)으로 정렬하고 rank를 매긴다.
// 동점자는 같은 rank를 받고(RANK 방식), 다음 순위는 건너뛴다.
func rankEntries(raw []domain.RankingRaw) []domain.RankingEntry {
	entries := make([]domain.RankingEntry, len(raw))
	for i, r := range raw {
		entries[i] = domain.RankingEntry{
			UserID:        r.UserID,
			Username:      r.Username,
			Streak:        r.Streak,
			ClearedVerses: r.ClearedVerses,
			DictationPts:  r.DictationPts,
			Score:         rankScore(r),
		}
	}
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].Score != entries[j].Score {
			return entries[i].Score > entries[j].Score
		}
		return entries[i].UserID < entries[j].UserID
	})
	for i := range entries {
		if i > 0 && entries[i].Score == entries[i-1].Score {
			entries[i].Rank = entries[i-1].Rank
		} else {
			entries[i].Rank = i + 1
		}
	}
	return entries
}
