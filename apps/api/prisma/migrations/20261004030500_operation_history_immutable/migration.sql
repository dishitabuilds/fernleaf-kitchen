CREATE TRIGGER "DropEvent_immutable" BEFORE UPDATE ON "DropEvent"
  FOR EACH ROW EXECUTE FUNCTION "reject_order_history_update"();
