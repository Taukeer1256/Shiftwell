"""Recomputes every material number in the Shiftwell case from the brief's data tables.
Outputs audit.json (consumed by the PDF builder) and prints a human-readable report."""
import json, statistics

# name: (segment, locations, arr_lakh, renewal 'YYYY-MM', staff, swaps_per_month, pct24, mgr_hrs, health)
active = {
 "UrbanMart":     ("Retail",      200, 110, "2027-08", 5200, 3100, 64, 3.5, "Healthy"),
 "FreshBowl":     ("Restaurants", 120,  84, "2027-01", 3600, 2900, 38, 6.5, "At risk"),
 "CarePoint":     ("Clinics",      40,  60, "2026-12",  900,  310, 71, 4.0, "At risk"),
 "QuickKart":     ("Retail",       90,  48, "2027-06", 2100, 1000, 67, 3.0, "Healthy"),
 "Spice Route":   ("Restaurants",  60,  36, "2027-03", 1500, 1400, 41, 6.0, "Watch"),
 "MedAxis Labs":  ("Diagnostics",  25,  30, "2027-02",  450,   90, 80, 2.5, "Healthy"),
 "FitZone":       ("Gyms",         50,  22, "2026-10",  600,  540, 35, 5.5, "At risk"),
 "Brew & Co":     ("Cafes",        35,  18, "2026-11",  700,  820, 29, 7.0, "At risk"),
}
# name: (segment, locations, arr_lost_lakh, reason, pct24_last3m)
lost = {
 "StyleHub":        ("Retail",      70, 30, "Budget cuts", 60),
 "TandooriTown":    ("Restaurants", 45, 25, "Price", 22),
 "GreenLeaf Salads":("Restaurants", 30, 16, "Moved to RotaPro (has WhatsApp)", 31),
 "PawsCare Vets":   ("Clinics",     15,  9, "Went back to spreadsheets", 33),
}
r = {}
total = sum(v[2] for v in active.values())
r["total_arr_lakh"] = total
r["total_arr_cr"] = total/100
r["n_active"] = len(active)

# renewals (inclusive of Jan 2027)
by_jan = {k:v[2] for k,v in active.items() if v[3] <= "2027-01"}
by_dec = {k:v[2] for k,v in active.items() if v[3] <= "2026-12"}
r["renew_by_jan27"] = {"accounts": by_jan, "arr_lakh": sum(by_jan.values()), "pct": round(100*sum(by_jan.values())/total,1)}
r["renew_by_dec26"] = {"accounts": by_dec, "arr_lakh": sum(by_dec.values()), "pct": round(100*sum(by_dec.values())/total,1)}
r["renew_by_jan27_all_at_risk"] = all(active[k][8]=="At risk" for k in by_jan)

# <50% approvals
act_lt50 = {k:v[6] for k,v in active.items() if v[6] < 50}
lost_lt50 = {k:v[4] for k,v in lost.items() if v[4] < 50}
r["lt50_active"] = {"accounts": act_lt50, "n": len(act_lt50), "arr_lakh": sum(active[k][2] for k in act_lt50),
                    "pct_of_arr": round(100*sum(active[k][2] for k in act_lt50)/total,1)}
r["lt50_lost"] = {"accounts": lost_lt50, "n": len(lost_lt50), "arr_lakh": sum(lost[k][2] for k in lost_lt50)}
r["lt50_total_n"] = len(act_lt50)+len(lost_lt50)
r["accounts_total_n"] = len(active)+len(lost)
r["lost_total_lakh"] = sum(v[2] for v in lost.values())
r["lost_lt50_share_pct"] = round(100*r["lt50_lost"]["arr_lakh"]/r["lost_total_lakh"],1)

# clinics + diagnostics
cd = {k:v for k,v in active.items() if v[0] in ("Clinics","Diagnostics")}
r["clinic_diag"] = {"accounts": list(cd), "arr_lakh": sum(v[2] for v in cd.values()),
                    "locations": sum(v[1] for v in cd.values()),
                    "pct_of_arr": round(100*sum(v[2] for v in cd.values())/total,1)}

# shares
for k in ("UrbanMart","FreshBowl","CarePoint"):
    r[f"share_{k}"] = round(100*active[k][2]/total,1)
r["share_top3_requesters"] = round(100*(110+84+60)/total,1)

# FreshBowl facts
fb = active["FreshBowl"]
r["fb_swaps_not_24h"] = round(fb[5]*(100-fb[6])/100)
r["fb_swaps_per_location_month"] = round(fb[5]/fb[1],1)
r["fb_manager_quote_per_location_month_low"] = 25*30   # 25 per night x 30 nights
r["fb_manager_quote_per_location_month_high"] = 30*30

# WhatsApp cost @ Rs0.35 per message, 2..4 messages per swap (assumption)
cost = {}
for m in (2,3,4):
    monthly = fb[5]*m*0.35
    cost[m] = {"monthly_rs": round(monthly), "annual_rs": round(monthly*12),
               "pct_of_fb_arr": round(100*monthly*12/(fb[2]*100000),2)}
r["whatsapp_cost"] = cost

# Sprint arithmetic from the brief
r["sprints_all_three_as_scoped"] = 1+2+3
r["whatsapp_share_of_capacity_pct"] = round(100*3/6)

# descriptive correlations (n=8)
def pearson(x,y):
    mx,my = statistics.mean(x),statistics.mean(y)
    num = sum((a-mx)*(b-my) for a,b in zip(x,y))
    den = (sum((a-mx)**2 for a in x)*sum((b-my)**2 for b in y))**0.5
    return num/den
names = list(active)
appr = [active[n][6] for n in names]
hrs  = [active[n][7] for n in names]
r["corr_approval_vs_mgr_hours"] = round(pearson(appr,hrs),2)
r["swaps_per_staff"] = {n: round(active[n][5]/active[n][4],2) for n in names}
r["carepoint_at_risk_with_pct24"] = active["CarePoint"][6]
r["lost_pct24"] = {k:v[4] for k,v in lost.items()}

r["accounts"] = sorted([{"name":k,"segment":v[0],"locations":v[1],"arr_lakh":v[2],"renewal":v[3],"pct24":v[6],"mgr_hrs":v[7],"health":v[8]} for k,v in active.items()], key=lambda a:a["renewal"])
json.dump(r, open("/home/claude/shiftwell/audit/audit.json","w"), indent=1, ensure_ascii=False)
print(json.dumps(r, indent=1, ensure_ascii=False))
