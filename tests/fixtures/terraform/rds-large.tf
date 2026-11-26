resource "aws_db_instance" "analytics_unscaled" {
  identifier        = "analytics"
  engine            = "postgres"
  instance_class    = "db.r5.4xlarge"
  allocated_storage = 100
  storage_encrypted = true
}

resource "aws_db_instance" "analytics_scaled" {
  identifier            = "analytics-ok"
  engine                = "postgres"
  instance_class        = "db.r5.4xlarge"
  allocated_storage     = 100
  max_allocated_storage = 500
  storage_encrypted     = true
}
