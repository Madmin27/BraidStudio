const { predictVisualSignature } = require('../src/utils/braidPredictor');

describe('BraidStudio - Deterministik İmza Tahmin Motoru Testleri', () => {

  test('rec_8_zebra -> plain_weave tahmini yapmalı', () => {
    const rec_8_zebra = {
      "1": "black", "2": "white", "3": "black", "4": "white",
      "5": "black", "6": "white", "7": "black", "8": "white"
    };
    const res = predictVisualSignature(rec_8_zebra, { braidLogic: "1_over_1" });
    expect(res.visualSignature).toBe("plain_weave");
    expect(res.patternFamily).toBe("diamond");
    expect(res.confidence).toBe(0.75);
  });

  test('rec_16_polyester_checker -> plain_weave tahmini yapmalı', () => {
    const rec_16_polyester_checker = {
      "1": "black", "2": "white", "3": "black", "4": "white",
      "5": "black", "6": "white", "7": "black", "8": "white",
      "9": "black", "10": "white", "11": "black", "12": "white",
      "13": "black", "14": "white", "15": "black", "16": "white"
    };
    const res = predictVisualSignature(rec_16_polyester_checker, { braidLogic: "1_over_1" });
    expect(res.visualSignature).toBe("plain_weave");
    expect(res.confidence).toBe(0.75);
  });

  test('rec_16_lvl3_herringbone -> diagonal_rib tahmini yapmalı', () => {
    const rec_16_lvl3_herringbone = {
      "1": "white", "2": "white", "3": "black", "4": "black",
      "5": "white", "6": "white", "7": "black", "8": "black",
      "9": "white", "10": "white", "11": "black", "12": "black",
      "13": "white", "14": "white", "15": "black", "16": "black"
    };
    const res = predictVisualSignature(rec_16_lvl3_herringbone, { braidLogic: "2_over_2" });
    expect(res.visualSignature).toBe("diagonal_rib");
    expect(res.patternFamily).toBe("twill");
    expect(res.confidence).toBe(0.72);
  });

  test('rec_24_marine_double_tracer -> spiral_tracer (veya kinematik kurala göre dual) tahmini yapmalı', () => {
    // 24 taşıyıcıda 4 adet accent (red) var. Oran: 4/24 = %16.6 (Tracer aralığında)
    // Pozisyonlar: 1, 7, 13, 19. Hepsi ODD (Tek sayı). Yani hepsi aynı yönde (Clockwise)
    const rec_24_marine_double_tracer = {
      "1": "red", "2": "white", "3": "white", "4": "white", "5": "white", "6": "white",
      "7": "red", "8": "white", "9": "white", "10": "white", "11": "white", "12": "white",
      "13": "red", "14": "white", "15": "white", "16": "white", "17": "white", "18": "white",
      "19": "red", "20": "white", "21": "white", "22": "white", "23": "white", "24": "white"
    };
    const res = predictVisualSignature(rec_24_marine_double_tracer, { braidLogic: "1_over_1" });
    expect(res.visualSignature).toBe("spiral_tracer");
    // Tek yönlü yörünge kümelenmesi uyarısını tetiklemeli:
    const hasKinematicWarning = res.warnings.some(w => w.includes("Kinematik Uyuşmazlık Uyarısı"));
    expect(hasKinematicWarning).toBe(true);
  });

  test('rec_12_medical_dual_trace -> Tek yönlü kümelenme uyarısı üretmeli', () => {
    // 1 ve 7 nolu taşıyıcılar accent. Her ikisi de ODD (Tek sayı).
    const rec_12_medical_dual_trace = {
      "1": "blue", "2": "white", "3": "white", "4": "white", "5": "white", "6": "white",
      "7": "blue", "8": "white", "9": "white", "10": "white", "11": "white", "12": "white"
    };
    const res = predictVisualSignature(rec_12_medical_dual_trace, { braidLogic: "1_over_1" });
    
    expect(res.visualSignature).toBe("spiral_tracer"); // dual_counter_spiral olamaz çünkü yönler zıt değil.
    const hasKinematicWarning = res.warnings.some(w => w.includes("Kinematik Uyuşmazlık Uyarısı"));
    expect(hasKinematicWarning).toBe(true);
  });

  test('Gerçek bir dual_counter_spiral (biri odd diğeri even) durumunu doğru ayırt etmeli', () => {
    // 1 (Odd -> CW) ve 8 (Even -> CCW) mavi. Zıt yönlü sarmal oluştururlar.
    const validCounterSpiral = {
      "1": "blue", "2": "white", "3": "white", "4": "white", "5": "white", "6": "white",
      "7": "white", "8": "blue", "9": "white", "10": "white", "11": "white", "12": "white"
    };
    const res = predictVisualSignature(validCounterSpiral, { braidLogic: "1_over_1" });
    expect(res.visualSignature).toBe("dual_counter_spiral");
    expect(res.patternFamily).toBe("tracer");
    expect(res.confidence).toBe(0.68);
  });
});
