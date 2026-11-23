import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stockCategoryFilter } from "./stock-category";

describe("departmental stock category filters", () => {
  it("includes pharmaceutical inventory in pharmacy requests", () => {
    assert.equal(stockCategoryFilter("pharmacy"), "category.ilike.%pharmacy%,category.ilike.%pharmaceutical%");
  });
  it("accepts the pharmaceutical category alias", () => {
    assert.equal(stockCategoryFilter("pharmaceutical"), stockCategoryFilter("pharmacy"));
  });
  it("keeps laboratory requests limited to laboratory categories", () => {
    assert.equal(stockCategoryFilter("lab"), "category.ilike.%lab%");
  });
});