from decimal import Decimal

from cic.gain import by_concept, module_gain, student_gain, summarize, suppress


def asm(score, **concepts):
    return {"scorePct": Decimal(str(score)), "byConcept": {c: {"correct": Decimal(str(a)), "total": Decimal(str(b)), "items": i}
                                                            for c, (a, b, i) in concepts.items()}}


def test_student_gain_and_normalized_gain():
    assert student_gain(40, 70) == {"pre": 40.0, "post": 70.0, "gain": 30.0, "normalizedGain": 0.5}
    assert student_gain(100, 100)["normalizedGain"] is None  # undefined at pre = 100


def test_class_summary_uses_means_not_mean_of_ratios():
    s = summarize([(40, 80), (60, 70)], enrolled=3)
    assert (s["n"], s["nEnrolled"]) == (2, 3)
    assert (s["meanPre"], s["meanPost"], s["meanGain"]) == (50.0, 75.0, 25.0)
    assert s["normalizedGain"] == 0.5


def test_empty_group_has_no_metrics():
    assert summarize([])["meanGain"] is None


def test_suppression_hides_small_groups():
    small = suppress(summarize([(40, 80)] * 4))
    assert small["suppressed"] and small["meanGain"] is None and small["n"] == 4
    big = suppress(summarize([(40, 80)] * 5))
    assert not big["suppressed"] and big["meanGain"] == 40.0


def test_module_gain_counts_only_students_with_both_scores():
    data = {
        "s1": {"pre": asm(40, loops=(1, 3, 3)), "post": asm(80, loops=(3, 3, 3))},
        "s2": {"pre": asm(50, loops=(2, 3, 3)), "post": None},
        "s3": {"pre": None, "post": asm(90, loops=(3, 3, 3))},
    }
    out = module_gain(data, enrolled=5)
    assert out["class"]["n"] == 1 and out["class"]["nEnrolled"] == 5
    rows = {r["studentId"]: r for r in out["students"]}
    assert rows["s1"]["gain"] == 40.0
    assert rows["s2"]["pre"] == 50.0 and rows["s2"]["gain"] is None
    assert rows["s3"]["post"] == 90.0 and rows["s3"]["gain"] is None


def test_concept_gain_and_low_item_flag():
    data = {"s1": {"pre": asm(40, loops=(1, 4, 4), syntax=(0, 1, 1)), "post": asm(80, loops=(4, 4, 4), syntax=(1, 1, 1))}}
    rows = {r["concept"]: r for r in by_concept(data)}
    assert rows["loops"]["meanPre"] == 25.0 and rows["loops"]["meanPost"] == 100.0 and rows["loops"]["meanGain"] == 75.0
    assert rows["loops"]["lowItemCount"] is False
    assert rows["syntax"]["lowItemCount"] is True
