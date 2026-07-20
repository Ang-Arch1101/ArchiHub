# -*- coding: utf-8 -*-
"""合成信件產生器 — 獨立於 ArchiHub 本體，只用來產生假資料測試「文字→Request 萃取」。

零依賴（Python 3.10+ 標準庫）。不讀寫 sample/ 或 data/，輸出全部進 output/。

用法：
    python generate_emails.py                # 預設 40 封，seed=42
    python generate_emails.py --count 50 --seed 7 --out-dir output
"""
import argparse
import json
import random
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# ── 實體池（全部虛構，跟公司真實資料無關）─────────────────────
PEOPLE = [
    ("陳志明", "監造", "chen.zhiming"),
    ("林建宏", "主任", "lin.jianhong"),
    ("王淑芬", "副理", "wang.shufen"),
    ("李文成", "工程師", "li.wencheng"),
    ("張美玲", "經理", "chang.meiling"),
    ("黃國強", "課長", "huang.guochiang"),
    ("吳宗翰", "協理", "wu.tsunghan"),
    ("蔡佳蓉", "業主代表", "tsai.chiajung"),
    ("劉俊傑", "監工", "liu.chunchieh"),
    ("鄭雅文", "行政", "cheng.yawen"),
    ("許志偉", "設計師", "hsu.chihwei"),
    ("楊淑惠", "PM", "yang.shuhui"),
]

INTERNAL_DOMAIN = "sinotech-demo.com"
INBOX_ADDR = "archihub-inbox@928816-demo.sinotech-demo.com"

VENDORS = [
    ("宏昇機電", "vendor@hs-me-demo.com"),
    ("大成營造", "contact@dacheng-const-demo.com"),
    ("永信空調", "info@ys-ac-demo.com.tw"),
    ("台鋼結構", "service@tsteel-demo.com"),
    ("正新消防", "fire@jsfire-demo.tw"),
    ("鑫達玻璃帷幕", "sales@sd-glass-demo.com"),
]

BUILDINGS = [
    ("91", "管理大樓", "928816"),
    ("A2", "研發大樓", "928820"),
    ("C區", "廠房", "928835"),
]

DRAWING_SERIES = {
    "A": ["101", "201", "301", "501", "502"],
    "S": ["101", "201", "301"],
    "E": ["301", "401"],
    "M": ["201", "202"],
    "P": ["301", "302"],
    "F": ["101"],
}

ROOMS = [
    "2F 大廳", "3F 樓梯間", "B1 停車場", "5F 辦公室", "2F 廁所",
    "4F 機房", "1F 門廳", "6F 會議室", "地下室管道間", "屋突層",
    "3F 茶水間", "2F 電梯廳",
]

DIM_CHANGES = [
    "東移 10 公分", "西移 15 公分", "往北挪 20 公分", "降低 5 公分",
    "加大到 90 公分", "縮小為 60 公分", "上移 30 公分", "南移 8 公分",
]

MATERIALS = [
    "拋光石英磚", "石材", "抿石子", "水泥粉光", "環氧樹脂地坪", "塑膠地磚",
]

REGULATIONS = [
    "無障礙設施設計規範", "建築技術規則", "消防法規", "綠建築標章規範",
]

DATES_JULY = list(range(1, 21))  # 07/01 ~ 07/20，配合目前日期


def pick_person(exclude=None):
    pool = [p for p in PEOPLE if p != exclude] if exclude else PEOPLE
    return random.choice(pool)


def pick_vendor():
    return random.choice(VENDORS)


def pick_building():
    return random.choice(BUILDINGS)


def pick_drawing():
    series = random.choice(list(DRAWING_SERIES.keys()))
    num = random.choice(DRAWING_SERIES[series])
    return f"{series}-{num}"


def email_of(romanized):
    return f"{romanized}{random.randint(10,99)}@{INTERNAL_DOMAIN}"


def salutation(name, title):
    """業界慣用『姓+職稱』稱呼，例如 陳監造、林主任，不用全名。"""
    return f"{name[0]}{title}"


def date_str(day=None, hour=None, minute=None):
    d = day if day is not None else random.choice(DATES_JULY)
    h = hour if hour is not None else random.randint(8, 18)
    m = minute if minute is not None else random.choice([0, 5, 10, 15, 20, 30, 45, 50])
    return f"2026-07-{d:02d} {h:02d}:{m:02d}", f"{d:02d}"


OPENERS = [
    "{sal} 您好，",
    "{sal} 您好，不好意思打擾了，",
    "{sal} 好，抱歉臨時聯繫，",
    "Dear {sal}，",
    "{sal}，您好，",
    "{sal} 您好，麻煩協助一下，",
]

CLOSERS = [
    "謝謝。",
    "麻煩協助，感謝。",
    "先謝謝了。",
    "如有問題再麻煩告知，謝謝。",
    "辛苦了，謝謝。",
    "感謝協助處理。",
]

SIGNS = [
    "{name}\n{title}",
    "{name} {title} 敬上",
    "{name}",
]


def opener(to_name, to_title):
    return random.choice(OPENERS).format(sal=salutation(to_name, to_title))


def closer():
    return random.choice(CLOSERS)


def sign(name, title):
    return random.choice(SIGNS).format(name=name, title=title)


# ── 各類別產生器：回傳 (subject, body, ground_truth_dict) ──────
# ground_truth 一律含 sender_name/sender_title/sender_email（給 email 檔頭用，
# 跟 expected_requests 是否可執行無關——非任務類信件一樣有真實寄件人）。

def gen_drawing_revision_single(idx):
    sender_name, sender_title, sender_rom = pick_person()
    to_name, to_title, _ = pick_person(exclude=(sender_name, sender_title, sender_rom))
    bld_alias, bld_name, bld_code = pick_building()
    room = random.choice(ROOMS)
    change = random.choice(DIM_CHANGES)
    use_explicit_code = random.random() < 0.5
    drawing = pick_drawing()
    due_day = random.choice(DATES_JULY[5:])

    core_variants = [
        f"配合現場狀況，{bld_alias} {room} 的位置請{change}，麻煩本週{('五' if due_day % 7 else '三')}前回覆新圖。",
        f"{'（' + drawing + '）' if use_explicit_code else ''}{bld_alias} {room}那邊尺寸需要調整，請{change}，07/{due_day:02d}前需要。",
        f"現場放樣發現{room}位置有點問題，請{change}，麻煩盡快出圖，07/{due_day:02d}前給我。",
    ]
    core = random.choice(core_variants)
    subject = f"【{bld_alias}】{room} 位置調整"
    body = f"{opener(to_name, to_title)}\n{core}\n{closer()}\n\n{sign(sender_name, sender_title)}"

    return subject, body, {
        "sender_name": sender_name, "sender_title": sender_title,
        "sender_email": email_of(sender_rom),
        "category": "drawing_revision_single",
        "is_actionable": True,
        "expected_request_count": 1,
        "expected_requests": [{
            "drawing_ref": drawing if use_explicit_code else None,
            "drawing_ref_alias": f"{bld_alias} {room}",
            "drawing_ref_type": "explicit_code" if use_explicit_code else "alias_only",
            "title": f"{room} {change}",
            "requester_name": sender_name,
            "requester_email": email_of(sender_rom),
            "due_date": f"07/{due_day:02d}",
            "quoted_text": core,
        }],
        "notes": "單一明確改圖要求；約一半樣本圖號只給別名不給明確圖號，測試對照表 fallback。",
    }


def gen_meeting_minutes(idx):
    sender_name, sender_title, sender_rom = pick_person()
    n_items = random.randint(2, 4)
    items, expected = [], []
    for i in range(n_items):
        actionable = random.random() < 0.7
        if actionable:
            bld_alias, bld_name, bld_code = pick_building()
            room = random.choice(ROOMS)
            if random.random() < 0.5:
                old_material, material = random.sample(MATERIALS, 2)
                text = f"{bld_alias} {room}材質由{old_material}改為{material}，請設計單位提送修正圖。"
            else:
                change = random.choice(DIM_CHANGES)
                text = f"{bld_alias} {room} {change}，請設計單位確認並出圖。"
            drawing = pick_drawing()
            items.append(text)
            expected.append({
                "drawing_ref": drawing if random.random() < 0.4 else None,
                "drawing_ref_alias": f"{bld_alias} {room}",
                "drawing_ref_type": "explicit_code" if drawing else "alias_only",
                "title": text[:20],
                "requester_name": sender_name,
                "requester_email": email_of(sender_rom),
                "due_date": "",
                "quoted_text": text,
            })
        else:
            noise_items = [
                "下次會議時間訂於下週三上午 10 點，地點同上。",
                "請各單位於會議紀錄核可後三日內回覆意見，逾期視同同意。",
                "工地安全講習請各廠商派員參加，時間另行通知。",
                "本次會議紀錄由業主代表確認後正式發布。",
            ]
            items.append(random.choice(noise_items))
    meeting_no = random.randint(10, 30)
    subject = f"第{meeting_no}次工務會議紀錄"
    numbered = "\n".join(f"決議事項{i+1}：{t}" for i, t in enumerate(items))
    body = f"{sender_name}{sender_title} 整理如下：\n\n{numbered}\n\n{closer()}\n\n{sign(sender_name, sender_title)}"

    return subject, body, {
        "sender_name": sender_name, "sender_title": sender_title,
        "sender_email": email_of(sender_rom),
        "category": "meeting_minutes_multi",
        "is_actionable": True,
        "expected_request_count": len(expected),
        "expected_requests": expected,
        "notes": "一封信含多筆決議事項，部分可執行、部分是行政性 noise，需要逐項判斷是否建立 Request。",
    }


def gen_field_note_casual(idx):
    sender_name, sender_title, sender_rom = pick_person()
    bld_alias, bld_name, bld_code = pick_building()
    room = random.choice(ROOMS)
    other_name = pick_person(exclude=(sender_name, sender_title, sender_rom))[0]
    templates = [
        f"{bld_alias} {room}這邊隔間要往東移 15 公分 — {other_name}口頭",
        f"{bld_alias} {room}的消防栓箱跟門片開向打架，箱體要往北挪，順便確認符不符法規",
        f"現場發現{room}管線跟樑衝突，要改路徑，先記一下等回辦公室再確認圖號",
        f"{room}天花板高度不夠，機電管線打架，要跟{other_name}討論怎麼改",
    ]
    core = random.choice(templates)
    subject = "工地筆記"
    body = core  # 現場筆記不用敬語開頭、不掛 email 檔頭，維持口語、無簽名

    return subject, body, {
        "sender_name": sender_name, "sender_title": sender_title, "sender_email": None,
        "category": "field_note_casual",
        "is_actionable": True,
        "expected_request_count": 1,
        "expected_requests": [{
            "drawing_ref": None,
            "drawing_ref_alias": f"{bld_alias} {room}",
            "drawing_ref_type": "alias_only",
            "title": core[:20],
            "requester_name": sender_name,
            "requester_email": None,
            "due_date": "",
            "quoted_text": core,
        }],
        "notes": "口語現場筆記，無寄件人 email、無稱謂開頭，需要從內文/檔案來源推斷 requester。",
        "_no_header": True,
    }


def gen_vendor_rfi(idx):
    vendor_name, vendor_email = pick_vendor()
    to_name, to_title, _ = pick_person()
    drawing = pick_drawing()
    qty_a, qty_b, qty_c = random.sample(range(1, 8), 3)
    item_name = random.choice(["洗床機", "分電盤", "空調室外機", "消防灑水頭", "電梯機坑抽水泵"])
    subject = f"【詢問】{item_name}數量核對"
    core = (f"貴司{drawing}圖說標示{item_name} {qty_a} 台、數量表 {qty_b} 台、"
            f"詳細價目表 {qty_c} 台，三者不符，請確認正確數量後回覆。")
    body = f"{opener(to_name, to_title)}\n{core}\n{closer()}\n\n{sign(vendor_name, '')}"

    return subject, body, {
        "sender_name": vendor_name, "sender_title": "", "sender_email": vendor_email,
        "category": "vendor_rfi_quantity",
        "is_actionable": True,
        "expected_request_count": 1,
        "expected_requests": [{
            "drawing_ref": drawing,
            "drawing_ref_alias": None,
            "drawing_ref_type": "explicit_code",
            "title": f"{item_name}數量不符核對",
            "requester_name": vendor_name,
            "requester_email": vendor_email,
            "due_date": "",
            "quoted_text": core,
        }],
        "notes": "廠商跨文件數量核對需求，request 類型是「核對」不是「改圖」，外部寄件人網域跟公司內部不同。",
    }


def gen_schedule_coordination(idx):
    sender_name, sender_title, sender_rom = pick_person()
    to_name, to_title, _ = pick_person(exclude=(sender_name, sender_title, sender_rom))
    day = random.choice(DATES_JULY)
    subject = "會議時間確認"
    core_variants = [
        f"下週{('二' if day % 2 else '四')}下午 2 點的工地協調會，請問{salutation(to_name, to_title)}方便參加嗎？",
        f"07/{day:02d}的驗收排程麻煩再確認一次，看看廠商能不能配合。",
        f"這週的進度會議想提前到早上 9 點，方便的話麻煩回覆一下。",
    ]
    core = random.choice(core_variants)
    body = f"{opener(to_name, to_title)}\n{core}\n{closer()}\n\n{sign(sender_name, sender_title)}"

    return subject, body, {
        "sender_name": sender_name, "sender_title": sender_title,
        "sender_email": email_of(sender_rom),
        "category": "schedule_coordination",
        "is_actionable": False,
        "expected_request_count": 0,
        "expected_requests": [],
        "notes": "純排程協調，不涉及圖面修改，AI 應判定為不可執行（不建立 Request）。",
    }


def gen_admin_noise(idx):
    sender_name, sender_title, sender_rom = pick_person()
    subjects_bodies = [
        ("端午節放假通知", "因應端午連假，公司自 07/19（日）至 07/21（二）休假，07/22（三）恢復正常上班。"),
        ("消防演習通知", "本週五下午 3 點將進行全棟消防演習，請各單位配合疏散，勿使用電梯。"),
        ("內部教育訓練", "本月教育訓練主題為「圖面版本管理實務」，時間另行公告，請同仁踴躍參加。"),
        ("停車場刷卡系統維護", "本週六 09:00-12:00 停車場刷卡系統維護，期間請改走側門並向警衛登記。"),
        ("差旅報帳提醒", "本月差旅費報帳截止日為 07/25，請同仁儘速送出單據，逾期需下月才能核銷。"),
    ]
    subject, core = random.choice(subjects_bodies)
    body = f"{sender_name}{sender_title} 提醒：\n\n{core}\n\n{closer()}\n\n{sign(sender_name, sender_title)}"

    return subject, body, {
        "sender_name": sender_name, "sender_title": sender_title,
        "sender_email": email_of(sender_rom),
        "category": "admin_noise",
        "is_actionable": False,
        "expected_request_count": 0,
        "expected_requests": [],
        "notes": "純行政庶務信，跟圖面/任務完全無關，AI 應該完全忽略，不能誤觸發 Request。",
    }


def gen_regulation_inquiry(idx):
    sender_name, sender_title, sender_rom = pick_person()
    to_name, to_title, _ = pick_person(exclude=(sender_name, sender_title, sender_rom))
    reg = random.choice(REGULATIONS)
    bld_alias, bld_name, bld_code = pick_building()
    room = random.choice(ROOMS)
    subject = f"【確認】{room} 是否符合{reg}"
    core = f"想請教一下，{bld_alias} {room}目前的設計是否符合{reg}的規定？如果不符合可能要麻煩調整。"
    body = f"{opener(to_name, to_title)}\n{core}\n{closer()}\n\n{sign(sender_name, sender_title)}"

    return subject, body, {
        "sender_name": sender_name, "sender_title": sender_title,
        "sender_email": email_of(sender_rom),
        "category": "regulation_inquiry",
        "is_actionable": True,
        "expected_request_count": 1,
        "expected_requests": [{
            "drawing_ref": None,
            "drawing_ref_alias": f"{bld_alias} {room}",
            "drawing_ref_type": "alias_only",
            "title": f"{room} {reg}合規確認",
            "requester_name": sender_name,
            "requester_email": email_of(sender_rom),
            "due_date": "",
            "quoted_text": core,
        }],
        "notes": "詢問句而非指令句，是否該建 Request 邊界模糊（低信心案例），故意保留給 AI 判斷。",
    }


def gen_complaint_ambiguous(idx):
    sender_name, sender_title, sender_rom = pick_person()
    to_name, to_title, _ = pick_person(exclude=(sender_name, sender_title, sender_rom))
    bld_alias, bld_name, bld_code = pick_building()
    room = random.choice(ROOMS)
    core_variants = [
        f"{bld_alias} {room}那邊我看了很不滿意，跟當初講的完全不一樣，麻煩你們檢討一下。",
        f"業主昨天去現場看{room}，反應很多，說跟圖面對不起來，你們要不要去看一下狀況。",
        f"{room}做出來的效果我覺得怪怪的，是不是哪裡有改過沒同步到圖上？",
    ]
    core = random.choice(core_variants)
    subject = f"關於 {room} 的問題"
    body = f"{opener(to_name, to_title)}\n{core}\n{closer()}\n\n{sign(sender_name, sender_title)}"

    return subject, body, {
        "sender_name": sender_name, "sender_title": sender_title,
        "sender_email": email_of(sender_rom),
        "category": "complaint_ambiguous",
        "is_actionable": None,
        "expected_request_count": 0,
        "expected_requests": [],
        "notes": "抱怨/客訴語氣，沒有明確可執行指令，is_actionable 故意標 null——測試 AI 會不會硬湊一個 Request，正確行為應該是標記『需要人工確認』而非自動建單。",
    }


def gen_forwarded_chain(idx):
    orig_sender, orig_title, orig_rom = pick_person()
    forwarder, forwarder_title, forwarder_rom = pick_person(exclude=(orig_sender, orig_title, orig_rom))
    to_name, to_title, _ = pick_person(exclude=(forwarder, forwarder_title, forwarder_rom))
    bld_alias, bld_name, bld_code = pick_building()
    room = random.choice(ROOMS)
    change = random.choice(DIM_CHANGES)
    drawing = pick_drawing()
    core = f"{bld_alias} {room} 麻煩{change}，這週要回覆業主。"
    dt1, _ = date_str(day=random.choice(DATES_JULY[:10]))
    subject = f"Fwd: {room} 相關確認"

    top_comment_variants = [
        f"{salutation(to_name, to_title)} 麻煩幫忙處理一下下面這封，謝謝。",
        f"{salutation(to_name, to_title)}，請看下面業主的信，麻煩協助。",
    ]
    top_comment = random.choice(top_comment_variants)

    body = (
        f"{top_comment}\n\n{sign(forwarder, forwarder_title)}\n\n"
        f"------- 原始郵件 -------\n"
        f"寄件者：{orig_sender} {orig_title} <{email_of(orig_rom)}>\n"
        f"日期：{dt1}\n"
        f"主旨：{room} 相關確認\n\n"
        f"{opener(forwarder, forwarder_title)}\n{core}\n{closer()}\n\n{sign(orig_sender, orig_title)}"
    )

    return subject, body, {
        "sender_name": forwarder, "sender_title": forwarder_title,
        "sender_email": email_of(forwarder_rom),
        "category": "forwarded_chain",
        "is_actionable": True,
        "expected_request_count": 1,
        "expected_requests": [{
            "drawing_ref": drawing if random.random() < 0.3 else None,
            "drawing_ref_alias": f"{bld_alias} {room}",
            "drawing_ref_type": "alias_only",
            "title": f"{room} {change}",
            "requester_name": orig_sender,
            "requester_email": email_of(orig_rom),
            "due_date": "",
            "quoted_text": core,
        }],
        "notes": "轉寄鏈：真正的指示在被轉寄的原始信件內文，最上層只是『幫我處理』的轉交語句，requester 應該抓原始寄件人而不是轉寄者（From header 是轉寄者，不是 requester）。",
    }


def gen_bundled_multi_unrelated(idx):
    sender_name, sender_title, sender_rom = pick_person()
    to_name, to_title, _ = pick_person(exclude=(sender_name, sender_title, sender_rom))
    n = random.choice([2, 3])
    lines, expected = [], []
    for i in range(n):
        bld_alias, bld_name, bld_code = pick_building()
        room = random.choice(ROOMS)
        change = random.choice(DIM_CHANGES)
        drawing = pick_drawing()
        text = f"{i+1}. {bld_alias} {room}：{change}"
        lines.append(text)
        expected.append({
            "drawing_ref": drawing if random.random() < 0.4 else None,
            "drawing_ref_alias": f"{bld_alias} {room}",
            "drawing_ref_type": "explicit_code" if random.random() < 0.4 else "alias_only",
            "title": f"{room} {change}",
            "requester_name": sender_name,
            "requester_email": email_of(sender_rom),
            "due_date": "",
            "quoted_text": text,
        })
    subject = "幾件事一起麻煩"
    body = (f"{opener(to_name, to_title)}\n手上幾件事一起跟你說一下，不同棟的，麻煩分開處理：\n\n"
            + "\n".join(lines) + f"\n\n{closer()}\n\n{sign(sender_name, sender_title)}")

    return subject, body, {
        "sender_name": sender_name, "sender_title": sender_title,
        "sender_email": email_of(sender_rom),
        "category": "bundled_multi_unrelated",
        "is_actionable": True,
        "expected_request_count": n,
        "expected_requests": expected,
        "notes": "一封信夾帶多筆互不相關的要求（不同棟別/圖面），測試『一封信→N 個 Request』的拆分能力，不能合併成一筆。",
    }


GENERATORS = [
    (gen_drawing_revision_single, 10),
    (gen_meeting_minutes, 6),
    (gen_field_note_casual, 4),
    (gen_vendor_rfi, 4),
    (gen_schedule_coordination, 4),
    (gen_admin_noise, 4),
    (gen_regulation_inquiry, 2),
    (gen_complaint_ambiguous, 2),
    (gen_forwarded_chain, 2),
    (gen_bundled_multi_unrelated, 2),
]


def build_plan(count):
    base_total = sum(w for _, w in GENERATORS)
    scale = count / base_total
    plan = []
    for fn, w in GENERATORS:
        plan += [fn] * max(1, round(w * scale))
    random.shuffle(plan)
    return plan[:count]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=40)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out-dir", default="output")
    args = ap.parse_args()

    random.seed(args.seed)
    out_dir = ROOT / args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    for f in out_dir.glob("email_*.txt"):
        f.unlink()

    plan = build_plan(args.count)
    manifest = []
    for i, gen_fn in enumerate(plan, start=1):
        subject, body, gt = gen_fn(i)
        fname = f"email_{i:03d}.txt"
        dt_full, _ = date_str()

        if gt.get("_no_header"):
            content = body + "\n"
        else:
            content = (
                f"From: {gt['sender_name']} <{gt['sender_email']}>\n"
                f"To: {INBOX_ADDR}\n"
                f"Subject: {subject}\n"
                f"Date: {dt_full}\n\n"
                f"{body}\n"
            )

        (out_dir / fname).write_text(content, encoding="utf-8")
        gt.pop("_no_header", None)
        manifest.append({"file": fname, **gt})

    manifest_path = out_dir / "ground_truth.jsonl"
    with open(manifest_path, "w", encoding="utf-8") as f:
        for row in manifest:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    print(f"產生 {len(plan)} 封信 → {out_dir}")
    print(f"標準答案 → {manifest_path}")
    cnt = Counter(row["category"] for row in manifest)
    for k, v in cnt.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
